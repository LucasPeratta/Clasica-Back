import { Request, Response, NextFunction } from "express";
import { prisma } from "../db/index";
import passport from "passport";
import jwt from "jsonwebtoken";
import "../passport/index";

const secretKey = process.env.SECRET_KEY || "defaultSecretKey";

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  passport.authenticate(
    "local-signin",
    { session: false },
    async (err: Error, user: any, info: any) => {
      if (err) {
        return next(err);
      }
      if (!user) {
        return res.status(401).json({ message: info.message });
      }
      // Si las credenciales son válidas, firmar un token con los datos del usuario
      const token = jwt.sign({ id: user.id, email: user.email }, secretKey, {
        expiresIn: "1d",
      });
      // Agregar el token a la respuesta JSON
      return res.json({ user, token });
    }
  )(req, res, next);
};

export const register = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  passport.authenticate(
    "local-signup",
    { session: false },
    async (err: Error, user: any, info: any) => {
      if (err) {
        return next(err);
      }
      if (!user) {
        return res.status(401).json({ message: info.message });
      }
      // Si el usuario se creó correctamente, enviar una respuesta de éxito
      return res.status(200).json({ message: "Usuario creado correctamente" });
    }
  )(req, res, next);
};

export const logout = async (req: Request, res: Response) => {
  // Obtener el token de autorización del header
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Token no proporcionado" });
  }

  try {
    // Verificar y decodificar el token
    jwt.verify(token, secretKey);

    // Devolver una respuesta vacía con código 204
    res.sendStatus(204);
  } catch (error) {
    return res.status(401).json({ message: "Token inválido" });
  }
};
