/* eslint-disable no-param-reassign */
const { checkContext, getItems, replaceItems } = require('feathers-hooks-common');
const isIPFS = require('is-ipfs');
const url = require('url');

/**
 * For each item, attempt to resolve the specified prop if it exists and is an ipfs file
 *
 * if (daram {string|array} props property or array of properties we should attempt to resolve ipfs file paths for
 * @param {boolean} resolveInternal resolve files for internal requests
 */
module.exports = (props, resolveInternal = false) => context => {
  if (!context.params.provider && !resolveInternal) return context;

  checkContext(context, 'after', ['get', 'find', 'create', 'update', 'patch']);

  // eslint-disable-next-line no-param-reassign
  if (!Array.isArray(props)) props = [props];

  const ipfsGateway = context.app.get('ipfsGateway');

  if (!ipfsGateway || ipfsGateway === '') return context;

  const resolveFields = item => {
    props.forEach(fieldName => {
      if (item[fieldName] && isIPFS.ipfsPath(item[fieldName])) {
        item[fieldName] = url.resolve(ipfsGateway, item[fieldName]);
      }
    });
  };

  const items = getItems(context);

  if (Array.isArray(items)) {
    items.forEach(item => resolveFields(item));
  } else {
    resolveFields(items);
  }

  return replaceItems(context, items);
};
