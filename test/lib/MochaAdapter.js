/*
Copyright (c) 2012, Jan Prachař <jan@prachar.eu>
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

  * Redistributions of source code must retain the above copyright notice,
    this list of conditions and the following disclaimer.
  * Redistributions in binary form must reproduce the above copyright
    notice, this list of conditions and the following disclaimer in the
    documentation and/or other materials provided with the distribution.
  * Neither the name of the Morphine nor the names of its contributors may
    be used to endorse or promote products derived from this software
    without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/


/**
 * Mocha JsTestDriver Adapter.
 * @author jan@prachar.eu (Jan Prachar)
 */
(function(){

var getReporter = function (onTestDone, onComplete) {
	var Base = Mocha.reporters.Base;
	var Reporter = function (runner) {
		var self = this;

		Base.call(this, runner);
		this.onTestDone = onTestDone;
		this.onComplete = onComplete;

		this.reset = function () {
			jstestdriver.console.log_ = [];
		};

		this.reset();

		runner.on('start', function () {
		});

		runner.on('suite', function (suite) {
		});

		runner.on('suite end', function (suite) {
		});

		runner.on('test', function (test) {
			self.reset();
		});

		runner.on('pending', function () {
		});

		runner.on('pass', function (test) {
			self.onTestDone(new jstestdriver.TestResult(
				test.parent.fullTitle(),
				test.title,
				'passed',
				'',
				'',
				test.duration
			));
		});

		runner.on('fail', function (test, err) {
			var message = {
				message: err.message,
				name: '',
				stack: err.stack
			};
			self.onTestDone(new jstestdriver.TestResult(
				test.parent.fullTitle(),
				test.title,
				'failed',
				jstestdriver.angular.toJson([message]),
				'',
				test.duration
			));
		});

		runner.on('end', function () {
			self.onComplete();
		});
	};

	// Inherit from Base.prototype
	function F(){};
	F.prototype = Base.prototype;
	Reporter.prototype = new F;
	Reporter.prototype.constructor = Reporter;

	return Reporter;
};

var MOCHA_TYPE = 'mocha test case';
TestCase('Mocha Adapter Tests', null, MOCHA_TYPE);

jstestdriver.pluginRegistrar.register({

	name: 'mocha',

	getTestRunsConfigurationFor: function (testCaseInfos, expressions, testRunsConfiguration) {
		for (var i = 0; i < testCaseInfos.length; i++) {
			if (testCaseInfos[i].getType() === MOCHA_TYPE) {
				testRunsConfiguration.push(new jstestdriver.TestRunConfiguration(testCaseInfos[i], []));
			}
		}
	},

	runTestConfiguration: function (config, onTestDone, onComplete) {
		if (config.getTestCaseInfo().getType() !== MOCHA_TYPE) return false;

		mocha.reporter(getReporter(onTestDone, onComplete));
		mocha.run();
		return true;
	},

	onTestsFinish: function () {

	}

});

})();
