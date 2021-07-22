// Initializes the `milestones` service on path `/milestones`
const createService = require('feathers-mongoose');
const { createModel } = require('../../models/milestones.model');
const hooks = require('./milestones.hooks');
const { defaultFeatherMongooseOptions } = require('../serviceCommons');

module.exports = function milestones() {
  const app = this;
  const Model = createModel(app);
  const paginate = app.get('paginate');

  const options = {
    name: 'milestones',
    Model,
    paginate,
    ...defaultFeatherMongooseOptions,
  };

  // Initialize our service with any options it requires
  app.use('/milestones', createService(options));

  // Get our initialized service so that we can register hooks and filters
  const service = app.service('milestones');

  service.hooks(hooks);
};
