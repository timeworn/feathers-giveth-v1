// Initializes the `dacs` service on path `/dacs`
const createService = require('feathers-nedb');
const createModel = require('../../models/dacs.model');
const hooks = require('./dacs.hooks');
const filters = require('./dacs.filters');

module.exports = function() {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'dacs',
    Model,
    paginate,
  };

  // Initialize our service with any options it requires
  app.use('/dacs', createService(options));

  // Get our initialized service so that we can register hooks and filters
  const service = app.service('dacs');

  service.hooks(hooks);

  if (service.filter) {
    service.filter(filters);
  }
};
