import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/db';

// Load env variables
dotenv.config();

const app = express();
const PORT = process.env['PORT'] || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// TODO: Routes will be added here phase by phase
// app.use('/api/auth', authRoutes);
// app.use('/api/menu', menuRoutes);
// app.use('/api/orders', orderRoutes);
// app.use('/api/inventory', inventoryRoutes);
// app.use('/api/waste', wasteRoutes);
// app.use('/api/reports', reportRoutes);

// Start
const start = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`🚀 Tablz API running on http://localhost:${PORT}`);
  });
};

start();

export default app;
