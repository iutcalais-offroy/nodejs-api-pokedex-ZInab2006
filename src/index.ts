import {createServer} from "http";
import {env} from "./env";
import express, {Request, Response} from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes";
import cardRoutes from "./routes/card.routes";
import {authenticateToken} from "./middlewares/auth.middleware";

// Create Express app
export const app = express();

// Middlewares
app.use(
    cors({
        origin: true,  // Autorise toutes les origines
        credentials: true,
    }),
);

app.use(express.json());

// Serve static files (Socket.io test client)
app.use(express.static('public'));

// Health check endpoint
app.get("/api/health", (_req, res) => {
    res.json({status: "ok", message: "TCG Backend Server is running"});
});

// Auth routes
app.use("/api/auth", authRoutes);

// Cards routes (public)
app.use("/api/cards", cardRoutes);

// Route de test protégée (pour tester le middleware)
app.get("/api/me", authenticateToken, (req: Request, res: Response) => {
    res.json({
        message: "Vous êtes authentifié",
        user: req.user,
    });
});

// Start server only if this file is run directly (not imported for tests)
if (require.main === module) {
    // Create HTTP server
    const httpServer = createServer(app);


    // Start server
    try {
        httpServer.listen(env.PORT, () => {
            console.log(`\n Server is running on http://localhost:${env.PORT}`);
            console.log(` Socket.io Test Client available at http://localhost:${env.PORT}`);
        });
    } catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
}
