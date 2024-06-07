const express = require('express');
const path = require('path');

const bodyParser = require('body-parser');
const { connect } = require('mongoose');

const { httpError, notFoundError } = require('./src/middleware/http-error');
const responseHeaders = require('./src/middleware/response-headers');
const userRoutes = require('./src/routes/users-routes');
const placesRoutes = require('./src/routes/places-routes');

const app = express();

// registering bodyParser for parsing body fields
app.use(bodyParser.json());

// attaching main headres to the response
app.use(responseHeaders);

// returning requested static images
app.use('/src/uploads/images', express.static(path.join(__dirname, 'src', 'uploads', 'images')));

// registering user routes
app.use('/api/users', userRoutes);

// registering place routes
app.use('/api/places', placesRoutes);

// registering a 404 error handling if any of the routes above don't work
app.use(notFoundError);

// registering global error handling
app.use(httpError);

// mongo DB connection
const DB_URL = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.cd8b6dz.mongodb.net/${process.env.DB_NAME}?retryWrites=true&w=majority&appName=Cluster0`;

connect(DB_URL)
  .then(() => {
    app.listen(process.env.PORT || 5000);
  })
  .catch((e) => {
    console.log('Error connecting to MongoDB:', e);
  });
