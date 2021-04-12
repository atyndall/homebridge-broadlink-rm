const uuid = require('uuid');

const delayForDuration = require('../helpers/delayForDuration');
const ServiceManagerTypes = require('../helpers/serviceManagerTypes');
const { getDevice } = require('../helpers/getDevice');
const BroadlinkRMAccessory = require('./accessory');

class TemperatureSensorAccessory extends BroadlinkRMAccessory {

  constructor(log, config = {}, serviceManagerType) {
    super(log, config, serviceManagerType);
    log('constructor')

    this.temperatureCallbackQueue = {};
    this.monitorTemperature();
  }


  setDefaults() {
    const { config, state } = this;

    // Set config default values
    config.temperatureUpdateFrequency = config.temperatureUpdateFrequency || 10;
    config.temperatureAdjustment = config.temperatureAdjustment || 0;
  }

  // Device Temperature Methods

  async monitorTemperature() {
    const { config, host, log, name } = this;

    const device = getDevice({ host, log });

    // Try again in a second if we don't have a device yet
    if (!device) {
      log(`${name} don't have device`)

      await delayForDuration(1);

      this.monitorTemperature();

      return;
    }

    log(`${name} monitorTemperature`);

    device.on('temperature', this.onTemperature.bind(this));
    device.checkTemperature();

    this.updateTemperatureUI();
    if (!config.isUnitTest) setInterval(this.updateTemperatureUI.bind(this), config.temperatureUpdateFrequency * 1000)
  }

  onTemperature(temperature) {
    const { config, host, log, name, state } = this;
    const { temperatureAdjustment } = config;

    // onTemperature is getting called twice. No known cause currently.
    // This helps prevent the same temperature from being processed twice 
    if (Object.keys(this.temperatureCallbackQueue).length === 0) return;

    temperature += temperatureAdjustment

    state.currentTemperature = temperature;

    log(`${name} onTemperature (${temperature})`);

    this.processQueuedTemperatureCallbacks(temperature);
  }

  addTemperatureCallbackToQueue(callback) {
    const { host, log, name, state } = this;

    // Clear the previous callback
    if (Object.keys(this.temperatureCallbackQueue).length > 1) {
      if (state.currentTemperature) {
        log(`${name} addTemperatureCallbackToQueue (clearing previous callback, using existing temperature)`);

        this.processQueuedTemperatureCallbacks(state.currentTemperature);
      }
    }

    // Add a new callback
    const callbackIdentifier = uuid.v4();
    this.temperatureCallbackQueue[callbackIdentifier] = callback;

    // Read temperature from Broadlink RM device
    // If the device is no longer available, use previous tempeature 
    const device = getDevice({ host, log });

    if (!device || device.state === 'inactive') {
      if (device && device.state === 'inactive') {
        log(`${name} addTemperatureCallbackToQueue (device no longer active, using existing temperature)`);
      }

      this.processQueuedTemperatureCallbacks(state.currentTemperature || 0);

      return;
    }

    device.checkTemperature();
    log(`${name} addTemperatureCallbackToQueue (requested temperature from device, waiting)`);
  }

  processQueuedTemperatureCallbacks(temperature) {
    if (Object.keys(this.temperatureCallbackQueue).length === 0) return;

    Object.keys(this.temperatureCallbackQueue).forEach((callbackIdentifier) => {
      const callback = this.temperatureCallbackQueue[callbackIdentifier];

      callback(null, temperature);
      delete this.temperatureCallbackQueue[callbackIdentifier];
    })

    this.temperatureCallbackQueue = {};
  }

  updateTemperatureUI() {
    const { serviceManager } = this;

    serviceManager.refreshCharacteristicUI(Characteristic.CurrentTemperature)
  }

  getCurrentTemperature(callback) {
    const { config, host, log, name, state } = this;
    const { pseudoDeviceTemperature } = config;

    // Some devices don't include a thermometer and so we can use `pseudoDeviceTemperature` instead
    if (pseudoDeviceTemperature !== undefined) {
      log(`${name} getCurrentTemperature (using pseudoDeviceTemperature ${pseudoDeviceTemperature} from config)`);

      return callback(null, pseudoDeviceTemperature);
    }

    this.addTemperatureCallbackToQueue(callback);
  }


  // Service Manager Setup

  setupServiceManager() {
    const { config, name, serviceManagerType } = this;

    log('running setup')

    this.serviceManager = new ServiceManagerTypes[serviceManagerType](name, Service.TemperatureSensor, this.log);

    this.serviceManager.addGetCharacteristic({
      name: 'currentTemperature',
      type: Characteristic.CurrentTemperature,
      method: this.getCurrentTemperature,
      bind: this
    })
  }
}

module.exports = TemperatureSensorAccessory
