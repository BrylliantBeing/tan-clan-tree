const path = require('path');
const { createRequestHandler } = require('expo-server/adapter/express');
const express = require('express');
const compression = require('compression');
const morgan = require('morgan');

const CLIENT_BUILD_DIR = path.join(process.cwd(), 'dist/client');
const SERVER_BUILD_DIR = path.join(process.cwd(), 'dist/server');

process.env.NODE_ENV = 'production';

const app = express();

app.use(compression());
app.disable('x-powered-by');

// Hostinger terminates TLS in front of the app
app.set('trust proxy', 1);

app.use(express.static(CLIENT_BUILD_DIR, { maxAge: '1h', extensions: ['html'] }));
app.use(morgan('tiny'));

app.all('/{*all}', createRequestHandler({ build: SERVER_BUILD_DIR }));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Express server listening on port ${port}`);
});
