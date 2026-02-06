import { describe, expect, it, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";
import jwt, { TokenExpiredError, JwtPayload } from "jsonwebtoken";
import { authenticateToken } from "@/middlewares/auth.middleware";
import { StatusCodes } from "http-status-codes";

// Mock simple de jwt
vi.mock("jsonwebtoken", async () => {
    const actual = await vi.importActual<typeof import("jsonwebtoken")>(
        "jsonwebtoken",
    );

    const tokenExpired = actual.TokenExpiredError;

    const defaultExport = {
        verify: vi.fn(),
        TokenExpiredError: tokenExpired,
    };

    return {
        default: defaultExport,
        TokenExpiredError: tokenExpired,
    };
});

// Mock simple de la config env
vi.mock("@/env", () => ({
    env: {
        JWT_SECRET: "test-secret",
    },
}));

describe("authenticateToken middleware", () => {
    let mockRequest: Partial<Request>;
    let mockResponse: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
        vi.clearAllMocks();

        mockRequest = {
            headers: {},
        };

        mockResponse = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
        };

        mockNext = vi.fn();
    });

    it("should call next() when token is valid", () => {
        mockRequest.headers = {
            authorization: "Bearer valid-token",
        };

        vi.mocked(jwt.verify).mockReturnValueOnce({
            userId: 1,
            email: "test@example.com",
        } as JwtPayload);

        authenticateToken(
            mockRequest as Request,
            mockResponse as Response,
            mockNext
        );

        expect(jwt.verify).toHaveBeenCalledWith("valid-token", "test-secret");
        expect(mockRequest.user).toEqual({
            userId: 1,
            email: "test@example.com",
        });
        expect(mockNext).toHaveBeenCalled();
        expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it("should return 401 when authorization header is missing", () => {
        mockRequest.headers = {};

        authenticateToken(
            mockRequest as Request,
            mockResponse as Response,
            mockNext
        );

        expect(mockResponse.status).toHaveBeenCalledWith(
            StatusCodes.UNAUTHORIZED
        );
        expect(mockResponse.json).toHaveBeenCalledWith({
            error: "Unauthorized",
            message: "Token manquant. Format attendu: Authorization: Bearer <token>",
        });
        expect(mockNext).not.toHaveBeenCalled();
    });

    it("should return 401 when authorization header does not start with Bearer", () => {
        mockRequest.headers = {
            authorization: "InvalidFormat token",
        };

        authenticateToken(
            mockRequest as Request,
            mockResponse as Response,
            mockNext
        );

        expect(mockResponse.status).toHaveBeenCalledWith(
            StatusCodes.UNAUTHORIZED
        );
        expect(mockResponse.json).toHaveBeenCalledWith({
            error: "Unauthorized",
            message: "Token manquant. Format attendu: Authorization: Bearer <token>",
        });
        expect(mockNext).not.toHaveBeenCalled();
    });

    it("should return 401 when token is empty after Bearer", () => {
        mockRequest.headers = {
            authorization: "Bearer ",
        };

        authenticateToken(
            mockRequest as Request,
            mockResponse as Response,
            mockNext
        );

        expect(mockResponse.status).toHaveBeenCalledWith(
            StatusCodes.UNAUTHORIZED
        );
        expect(mockResponse.json).toHaveBeenCalledWith({
            error: "Unauthorized",
            message: "Token manquant",
        });
        expect(mockNext).not.toHaveBeenCalled();
    });

    it("should return 401 when token is invalid", () => {
        mockRequest.headers = {
            authorization: "Bearer invalid-token",
        };

        // On simule un token invalide
        const verifyMock = vi.mocked(jwt.verify);
        verifyMock.mockImplementationOnce(() => {
            throw new Error("Invalid token");
        });

        authenticateToken(
            mockRequest as Request,
            mockResponse as Response,
            mockNext
        );

        expect(verifyMock).toHaveBeenCalledWith("invalid-token", "test-secret");
        expect(mockResponse.status).toHaveBeenCalled();
        expect(mockResponse.json).toHaveBeenCalled();
        expect(mockNext).not.toHaveBeenCalled();
    });

    it("should return 401 when token is expired", () => {
        mockRequest.headers = {
            authorization: "Bearer expired-token",
        };

        // On simule un token expiré
        const expiredError = new TokenExpiredError("Token expired", new Date());
        const verifyMock = vi.mocked(jwt.verify);
        verifyMock.mockImplementationOnce(() => {
            throw expiredError;
        });

        authenticateToken(
            mockRequest as Request,
            mockResponse as Response,
            mockNext
        );

        expect(verifyMock).toHaveBeenCalledWith("expired-token", "test-secret");
        expect(mockResponse.status).toHaveBeenCalled();
        expect(mockResponse.json).toHaveBeenCalled();
        expect(mockNext).not.toHaveBeenCalled();
    });

    it("should return 500 when an unexpected error occurs in outer try", () => {
        // On simule une erreur générale dans le middleware
        mockRequest.headers = undefined as never;

        authenticateToken(
            mockRequest as Request,
            mockResponse as Response,
            mockNext
        );

        // Le middleware devrait gérer l'erreur et retourner 500
        expect(mockResponse.status).toHaveBeenCalledWith(
            StatusCodes.INTERNAL_SERVER_ERROR
        );
        expect(mockResponse.json).toHaveBeenCalledWith({
            error: "Internal Server Error",
            message: "Erreur lors de la vérification du token",
        });
        expect(mockNext).not.toHaveBeenCalled();
    });
});

