// middlewares/auth.js - SINGLE middleware for all roles
import jwt from "jsonwebtoken";

export const verifyRole = (requiredRole = "user") => {
  return (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Bearer token required" });
      }

      const token = authHeader.split(" ")[1];
      const decoded = jwt.decode(token, { complete: true })?.payload;

      if (!decoded) {
        return res.status(401).json({ message: "Invalid token" });
      }

      // ✅ Extract role (custom:role OR cognito:groups)
      const role = decoded["custom:role"] || 
                   (decoded["cognito:groups"]?.includes("admins") ? "admin" : "customer");


      // ✅ Role check
      if (role !== requiredRole && requiredRole !== "user") {
        return res.status(403).json({ 
          message: `Requires ${requiredRole} role` 
        });
      }

      // ✅ Set req.user for controllers
      req.user = {
        userId: decoded.sub,
        email: decoded.email,
        role,
        groups: decoded["cognito:groups"] || [],
      };

      next();
    } catch (err) {
      console.error("Auth error:", err);
      res.status(401).json({ message: "Token verification failed" });
    }
  };
};

// ✅ Usage
export const isUser = verifyRole("user");
export const verifyAdmin = verifyRole("admin");
