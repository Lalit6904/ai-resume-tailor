import mongoose from 'mongoose';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

let connected = false;

export async function connectDatabase(uri = config.MONGODB_URI) {
  if (connected) return mongoose.connection;
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 20,
  });
  connected = true;
  logger.info('MongoDB connected', { database: mongoose.connection.name });
  return mongoose.connection;
}

export async function disconnectDatabase() {
  if (!connected) return;
  await mongoose.disconnect();
  connected = false;
}

export function getConnectionState() {
  return {
    readyState: mongoose.connection.readyState,
    name: mongoose.connection.name || null,
  };
}
