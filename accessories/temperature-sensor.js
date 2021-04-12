const delayForDuration = require('../helpers/delayForDuration');
const ServiceManagerTypes = require('../helpers/serviceManagerTypes');
const { getDevice } = require('../helpers/getDevice');
const BroadlinkRMAccessory = require('./accessory');

class TemperatureSensorAccessory extends BroadlinkRMAccessory {

  serviceType() { return Service.TemperatureSensor }

  constructor(log, config = {}) {
    super(log, config);
    this.monitorTemperature();
  }

  setDefaults() {
    const { config } = this;

    config.temperatureUpdateFrequency = config.temperatureUpdateFrequency || 10;
  }

  // Device Temperature Methods

  async monitorTemperature() {
    const { config, host, log, name } = this;

    // Ensure a minimum of a 60 seconds update frequency 
    const temperatureUpdateFrequency = Math.max(60, config.temperatureUpdateFrequency);

    const device = getDevice({ host, log });

    // Try again in a second if we don't have a device yet
    if (!device) {
      await delayForDuration(1);

      this.monitorTemperature();

      return;
    }

    log(`${name} monitorTemperature`);

    device.on('temperature', this.onTemperature.bind(this));
    device.checkTemperature();

    setInterval(this.monitorTemperature.bind(this), temperatureUpdateFrequency * 1000)
  }

  onTemperature(temperature) {
    this.state.currentTemperature = temperature;
    this.updateTemperatureUI();
  }

  updateTemperatureUI() {
    const { serviceManager } = this;

    serviceManager.refreshCharacteristicUI(Characteristic.CurrentTemperature)
  }

  getCurrentTemperature(callback) {
    callback(this.state.currentTemperature)
  }

  // Service Manager Setup

  setupServiceManager() {
    const { name, serviceManagerType } = this;

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
