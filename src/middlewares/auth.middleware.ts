import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../env";
import { StatusCodes } from "http-status-codes";


export const authenticateToken = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    try {
        // 1. Récupérer le token depuis l'en-tête Authorization
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            res.status(StatusCodes.UNAUTHORIZED).json({
                error: "Unauthorized",
                message: "Token manquant. Format attendu: Authorization: Bearer <token>",
            });
            return;
        }

        // Extraire le token (enlever "Bearer ")
        const token = authHeader.substring(7);

        if (!token) {
            res.status(StatusCodes.UNAUTHORIZED).json({
                error: "Unauthorized",
                message: "Token manquant",
            });
            return;
        }

        try {
            // 2. Vérifier et décoder le token
            const decoded = jwt.verify(token, env.JWT_SECRET) as {
                userId: number;
                email: string;
                iat?: number;
                exp?: number;
            };

            // 3. Ajouter userId et email à la requête pour l'utiliser dans les routes
            req.user = {
                userId: decoded.userId,
                email: decoded.email,
            };

            // 4. Passer au prochain middleware ou à la route
            next();
        } catch (error) {
            // Token invalide ou expiré
            if (error instanceof jwt.TokenExpiredError) {
                res.status(StatusCodes.UNAUTHORIZED).json({
                    error: "Unauthorized",
                    message: "Token expiré",
                });
                return;
            }

            res.status(StatusCodes.UNAUTHORIZED).json({
                error: "Unauthorized",
                message: "Token invalide",
            });
            return;
        }
    } catch (error) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            error: "Internal Server Error",
            message: "Erreur lors de la vérification du token",
        });
        return;
    }
};

