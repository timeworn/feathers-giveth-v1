// Initializes the `campaigns` service on path `/campaigns`
const createService = require('feathers-nedb');
const createModel = require('../../models/campaigns.model');
const hooks = require('./campaigns.hooks');
const filters = require('./campaigns.filters');

module.exports = function() {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'campaigns',
    Model,
    paginate,
  };

  // Initialize our service with any options it requires
  app.use('/campaigns', createService(options));

  // Get our initialized service so that we can register hooks and filters
  const service = app.service('campaigns');

  service.hooks(hooks);

  if (service.filter) {
    service.filter(filters);
  }
};
