// src/controllers/authController.js
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  AuthFlowType,
  AdminAddUserToGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import dotenv from "dotenv";
import ddb from "../config/dynamoClient.js";
import { PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { AdminGetUserCommand } from "@aws-sdk/client-cognito-identity-provider";

dotenv.config();
const USERS_TABLE = process.env.USERS_TABLE;

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION,
});

const CLIENT_ID = process.env.COGNITO_USER_CLIENT_ID;
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;

// =====================================================
// 1️⃣ REGISTER USER / ADMIN
// =====================================================
export const registerUser = async (req, res) => {
  const { email, password, role = "customer" } = req.body;

  if (!email || !password || !["customer", "admin"].includes(role)) {
    return res.status(400).json({
      message: "Email, password and role(customer/admin) required",
    });
  }

  try {
    // Create user in Cognito
    const signUpResponse = await cognitoClient.send(
      new SignUpCommand({
        ClientId: CLIENT_ID,
        Username: email,
        Password: password,
        UserAttributes: [
          { Name: "email", Value: email },
          { Name: "custom:role", Value: role },
        ],
      })
    );

    const userSub = signUpResponse.UserSub;

    res.status(201).json({
      success: true,
      message: "Registration successful. Please verify OTP sent to email.",
      userSub,
      role,
    });
  } catch (error) {
    console.error("Register error:", error);
    if (error.name === "UsernameExistsException") {
      return res.status(409).json({ message: "User already exists" });
    }
    res.status(500).json({ message: "Registration failed", error: error.message });
  }
};

// =====================================================
// 2️⃣ CONFIRM OTP + ASSIGN GROUP
// =====================================================
export const confirmRegistration = async (req, res) => {
  const { email, otp, role } = req.body;

  if (!email || !otp || !role) {
    return res.status(400).json({
      message: "Email, OTP and role required",
    });
  }

  try {
    // Confirm Cognito signup
    await cognitoClient.send(
      new ConfirmSignUpCommand({
        ClientId: CLIENT_ID,
        Username: email,
        ConfirmationCode: otp,
      })
    );

    // 🔥 Assign Cognito Group for role-based policies
    await cognitoClient.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: USER_POOL_ID,
        Username: email,
        GroupName: role === "admin" ? "admins" : "customers",
      })
    );

    // ✅ Get userSub FIRST to fix PK issue
  const adminGetUser = await cognitoClient.send(
    new AdminGetUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
    })
  );
  const userSub = adminGetUser.UserAttributes.find(attr => attr.Name === "sub")?.Value;

  // ✅ Update DynamoDB with correct PK
  await ddb.send(new PutCommand({
    TableName: USERS_TABLE,
    Item: {
      userId: userSub,  // ✅ Correct UUID PK!
      email,
      role,
      status: "confirmed",
      updatedAt: new Date().toISOString(),
    },
  }));

    res.json({
      success: true,
      message: `Account verified and added to ${role} group`,
    });
  } catch (error) {
    console.error("Confirm error:", error);
    res.status(400).json({ message: "Invalid OTP", error: error.message });
  }
};

// =====================================================
// 3️⃣ LOGIN (Read role from Cognito Groups)
// =====================================================
export const loginUser = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password required" });
  }

  try {
    const authResponse = await cognitoClient.send(
      new InitiateAuthCommand({
        ClientId: CLIENT_ID,
        AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
        },
      })
    );

    const tokens = authResponse.AuthenticationResult;
    if (!tokens) {
      return res.status(401).json({ message: "Authentication failed" });
    }

    // Decode Cognito ID token
  const payload = JSON.parse(
    Buffer.from(tokens.IdToken.split(".")[1], "base64").toString()
  );
  const cognitoUserId = payload.sub;  // ✅ UUID PK!

  // ✅ Get from DynamoDB using CORRECT PK
  const userResult = await ddb.send(new GetCommand({
    TableName: USERS_TABLE,
    Key: { userId: cognitoUserId },  // ✅ UUID, not email!
  }));

  const user = userResult.Item;
  
  // ✅ Fallback: Cognito confirmed + groups = OK
  const groups = payload["cognito:groups"] || [];
  const isCognitoConfirmed = payload["email_verified"];
  const role = groups.includes("admins") ? "admin" : "customer";

  // Skip DB status check - use Cognito truth
  if (!isCognitoConfirmed) {
    return res.status(403).json({ message: "Account not verified" });
  }

    res.json({
      success: true,
      message: "Login successful",
      role,
      tokens: {
        accessToken: tokens.AccessToken,
        idToken: tokens.IdToken,
        refreshToken: tokens.RefreshToken,
      },
      expiresIn: tokens.ExpiresIn,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(401).json({ message: "Invalid email or password" });
  }
};
