import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { StatusCodes } from "http-status-codes";
import { prisma } from "../database";
import { env } from "../env";

/**
 * Interface pour le payload de sign-up
 */
interface SignUpBody {
    email: string;
    username: string;
    password: string;
}

/**
 * Interface pour le payload de sign-in
 */
interface SignInBody {
    email: string;
    password: string;
}

/**
 * Génère un token JWT pour un utilisateur
 */
const generateToken = (userId: number, email: string): string => {
    return jwt.sign(
        { userId, email },
        env.JWT_SECRET,
        { expiresIn: "7d" } // Validité : 7 jours
    );
};

/**
 * POST /api/auth/sign-up
 * Créer un nouveau compte utilisateur avec authentification JWT
 */
export const signUp = async (
    req: Request<{}, {}, SignUpBody>,
    res: Response
): Promise<void> => {
    try {
        const { email, username, password } = req.body;

        // Vérifier que toutes les données sont présentes
        if (!email || !username || !password) {
            res.status(StatusCodes.BAD_REQUEST).json({
                error: "Bad Request",
                message: "Données manquantes. Email, username et password sont requis.",
            });
            return;
        }

        // Vérifier le format de l'email (validation basique)
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            res.status(StatusCodes.BAD_REQUEST).json({
                error: "Bad Request",
                message: "Format d'email invalide",
            });
            return;
        }

        // Vérifier que le mot de passe a au moins 6 caractères
        if (password.length < 6) {
            res.status(StatusCodes.BAD_REQUEST).json({
                error: "Bad Request",
                message: "Le mot de passe doit contenir au moins 6 caractères",
            });
            return;
        }

        // Vérifier l'unicité de l'email
        const existingUser = await prisma.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            res.status(StatusCodes.CONFLICT).json({
                error: "Conflict",
                message: "Cet email est déjà utilisé",
            });
            return;
        }

        // Vérifier l'unicité du username
        const existingUsername = await prisma.user.findUnique({
            where: { username },
        });

        if (existingUsername) {
            res.status(StatusCodes.CONFLICT).json({
                error: "Conflict",
                message: "Ce nom d'utilisateur est déjà utilisé",
            });
            return;
        }

        // Hasher le mot de passe
        const hashedPassword = await bcrypt.hash(password, 10);

        // Créer l'utilisateur
        const user = await prisma.user.create({
            data: {
                email,
                username,
                password: hashedPassword,
            },
            select: {
                id: true,
                email: true,
                username: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        // Générer le token JWT
        const token = generateToken(user.id, user.email);

        // Retourner les infos utilisateur et le token (sans le mot de passe)
        res.status(StatusCodes.CREATED).json({
            token,
            user,
        });
    } catch (error) {
        console.error("Erreur lors de l'inscription:", error);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            error: "Internal Server Error",
            message: "Erreur lors de la création du compte",
        });
        return;
    }
};

/**
 * POST /api/auth/sign-in
 * Se connecter avec un compte existant et recevoir un token JWT
 */
export const signIn = async (
    req: Request<{}, {}, SignInBody>,
    res: Response
): Promise<void> => {
    try {
        const { email, password } = req.body;

        // Vérifier que toutes les données sont présentes
        if (!email || !password) {
            res.status(StatusCodes.BAD_REQUEST).json({
                error: "Bad Request",
                message: "Email et password sont requis",
            });
            return;
        }

        // Récupérer l'utilisateur par email
        const user = await prisma.user.findUnique({
            where: { email },
        });

        // Vérifier si l'utilisateur existe
        if (!user) {
            res.status(StatusCodes.UNAUTHORIZED).json({
                error: "Unauthorized",
                message: "Email ou mot de passe incorrect",
            });
            return;
        }

        // Vérifier le mot de passe
        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            res.status(StatusCodes.UNAUTHORIZED).json({
                error: "Unauthorized",
                message: "Email ou mot de passe incorrect",
            });
            return;
        }

        // Générer le token JWT
        const token = generateToken(user.id, user.email);

        // Retourner les infos utilisateur et le token (sans le mot de passe)
        res.status(StatusCodes.OK).json({
            token,
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
            },
        });
    } catch (error) {
        console.error("Erreur lors de la connexion:", error);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            error: "Internal Server Error",
            message: "Erreur lors de la connexion",
        });
        return;
    }
};

