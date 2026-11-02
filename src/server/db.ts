import mysql from 'mysql2/promise';

export type Db = mysql.Pool | mysql.PoolConnection;
export type Row = mysql.RowDataPacket;

let pool: mysql.Pool | undefined;

export function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT ?? 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      connectionLimit: 5,
      charset: 'utf8mb4',
      // Keep DATE columns as 'YYYY-MM-DD' strings so birthdays never shift across time zones
      dateStrings: true,
    });
  }
  return pool;
}

export async function withTransaction<T>(work: (db: mysql.PoolConnection) => Promise<T>) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
