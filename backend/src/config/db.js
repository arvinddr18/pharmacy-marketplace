import mongoose from 'mongoose';
import { env } from './env.js';

mongoose.set('strictQuery', true);

export async function connectDB() {
  try {
    await mongoose.connect(env.mongoUri, {
      serverSelectionTimeoutMS: 8000,
    });
    console.log(`[db] connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
  } catch (err) {
    console.error('[db] connection failed:', err.message);
    throw err;
  }

  mongoose.connection.on('disconnected', () => console.warn('[db] disconnected'));
  mongoose.connection.on('error', (e) => console.error('[db] error:', e.message));
}

export async function disconnectDB() {
  await mongoose.connection.close();
}
