// A hook that logs service method before, after and error
import logger from 'winston';

export default function() {
  return function(hook) {
    let message = `${hook.type}: ${hook.path} - Method: ${hook.method}`;

    if (hook.type === 'error') {
      message += `: ${hook.error.message}`;
    }

    if (hook.params.provider) {
      logger.info(message);
    } else {
      logger.debug(`INTERNAL_CALL -> ${message}`);
    }
    logger.debug('hook.data', hook.data);
    logger.debug('hook.params', hook.params);

    if (hook.result) {
      logger.debug('hook.result', hook.result);
    }

    if (hook.error) {
      if (hook.path === 'authentication/challenges' && hook.error.message.includes('Challenge =')) {
        logger.warn(hook.error);
      } else {
        logger.warn(hook.error);
      }
    }
  };
}
