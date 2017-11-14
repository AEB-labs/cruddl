// Same as just running jasmine. Is used to be able to pass arguments to node
const JasmineConsoleReporter = require('jasmine-console-reporter');

var Jasmine = require('jasmine');
var SpecReporter = require('jasmine-spec-reporter').SpecReporter;
var jasmine = new Jasmine();
jasmine.loadConfigFile('./spec/support/jasmine.json');
jasmine.addReporter(new JasmineConsoleReporter({
    colors: 1
}));
jasmine.execute();
