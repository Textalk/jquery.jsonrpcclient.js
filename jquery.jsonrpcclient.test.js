TestCase(
  "JRPCClientTest", {
    testNew: function() {
      var test = new $.JRPCClient({ httpUrl: '/foobar1' });
      assertObject('test should be a new object', test);
    }
  }
);

// Adding a function to replace jQuery.ajax with for callbacks.
// It acts as a HTTP JSON-RPC 2.0 backend that returns the whole request as result for a request,
// and nothing for a notify.
function mock_jquery_ajax(params) {
  var data = $.parseJSON(params.data);

  // Call the success-callback if there is an id.
  if ('id' in data) {
    params.success({
      jsonrpc: '2.0',
      id: params.id,
      result: params
    });
  }
}

AsyncTestCase(
  'JRPCClientAsyncTest', {
    testBadBackend: function(queue) {
      // Setup a test client with a bad backend
      var test = new $.JRPCClient({ httpUrl: '/foobar2' });
      var error_cb_called = false;

      queue.call(
        'Step 1: register ajax callback.',
        function(callbacks) {
          var error_cb = callbacks.add(
            function(event, jqXHR, ajaxOptions) {
              error_cb_called = true;
            }
          );
          test.call('foo', [], error_cb, error_cb);
        }
      );

      queue.call(
        'Step 2: check that callback has been called correctly.',
        function() {
          assertTrue(
            'The error_cb should be triggered.',
            error_cb_called
          );
        }
      );
    },
    testBatchErrorInHttp: function(queue) {
      // Test that a non-existing backen gives the overall error_cb, and that the individual
      // callbacks are not called.
      var test = new $.JRPCClient({ httpUrl: '/foobar3' });
      var main_error_cb_called = false;
      var other_cb_called      = false;

      queue.call(
        'Step 1: register ajax callback.',
        function(callbacks) {
          var main_error_cb = callbacks.add(
            function(event, jqXHR, ajaxOptions) {
              main_error_cb_called = true;
            }
          );

          var other_cb = function() { other_cb_called = true; };

          test.startBatch();
          test.call('foo', [], other_cb, other_cb);
          test.call('bar', [], other_cb, other_cb);
          test.call('baz', [], other_cb, other_cb);
          test.endBatch(other_cb, main_error_cb);
        }
      );

      queue.call(
        'Step 2: check that callback has been called correctly.',
        function() {
          assertTrue(
            'The main error_cb should be triggered.',
            main_error_cb_called
          );
          assertFalse(
            'No other callback should be triggered.',
            other_cb_called
          );
        }
      );
    },

    testCall: function(queue) {
      // Test a normal call procedure.

      // Save the normal jQuery.ajax.
      var saved_jquery_ajax = jQuery.ajax;

      var given_url = '/bazz';
      var test = new $.JRPCClient({ httpUrl: given_url });

      var result          = null;
      var error_cb_called = false;

      queue.call(
        'Step 1: register ajax callback.',
        function(callbacks) {
          // Replace jQuery.ajax with a mocked function.
          jQuery.ajax = callbacks.add(mock_jquery_ajax);

          // Add a success_cb that should be called with the whole request as result.
          var success_cb = callbacks.add(
            function(given_result) {
              result = given_result;
            }
          );

          // An error_cb that should NOT be called.
          var error_cb = function(error) {
            error_cb_called = true;
          };

          test.call('foo', [], success_cb, error_cb);
        }
      );

      queue.call(
        'Step 2: check that callback has been called correctly.',
        function() {
          assertFalse(
            'Error callback should not be triggered.',
            error_cb_called
          );
          assertEquals('Url should be same.', result.url, given_url);

          // Restore jQuery.ajax
          jQuery.ajax = saved_jquery_ajax;
        }
      );
    },

    testNotify: function(queue) {
      // Test a normal notify procedure.

      // Save the normal jQuery.ajax.
      var saved_jquery_ajax = jQuery.ajax;

      var given_url = '/bront';
      var test = new $.JRPCClient({ httpUrl: given_url });

      var id = null;
      
      queue.call(
        'Step 1: register ajax callback.',
        function(callbacks) {
          var catch_cb = function(given_result) {
            var data = $.parseJSON(given_result.result.data);
            id = data.id;
          };

          // Replace jQuery.ajax with a mocked function.
          jQuery.ajax = callbacks.add(
            function(params) {
              // Override success and set the catch_cb to catch request.
              params.success = catch_cb;
              mock_jquery_ajax(params);
            }
          );

          test.notify('foo', []);
        }
      );

      queue.call(
        'Step 2: check that callback has been called correctly.',
        function() {
          assertNull('ID should not be set and cb would not be called.', id);

          // Restore jQuery.ajax
          jQuery.ajax = saved_jquery_ajax;
        }
      );
    },

    testNoWebSocket: function(queue) {
      // Test that HTTP will be used when both ws and http is given and there is no
      // window.WebSocket.

      // Save the normal jQuery.ajax.
      var saved_jquery_ajax = jQuery.ajax;

      var given_http_url = '/foz';
      var test = new $.JRPCClient({
        httpUrl: given_http_url,
        getSocket: function(onmessage_cb) { return null; }
      });

      var result = null;
      var error_cb_called = false;

      queue.call(
        'Step 1: register ajax callback.',
        function(callbacks) {
          // Replace jQuery.ajax with a mocked function.
          jQuery.ajax = callbacks.add(mock_jquery_ajax);

          // Add a success_cb that should be called with the whole request as result.
          var success_cb = callbacks.add(
            function(given_result) {
              result = given_result;
            }
          );

          // An error_cb that should NOT be called.
          var error_cb = function(error) {
            error_cb_called = true;
          };

          test.call('foo', [], success_cb, error_cb);
        }
      );

      queue.call(
        'Step 2: check that callback has been called correctly.',
        function() {
          assertFalse(
            'Error callback should not be triggered.',
            error_cb_called
          );
          assertEquals('Url should be same.', result.url, given_http_url);

          // Restore jQuery.ajax
          jQuery.ajax = saved_jquery_ajax;
        }
      );
    },

    testDefaultGetsocket: function(queue) {
      // Test the default ws_getsocket
      if (!('WebSocket' in window)) {
        // Skip test on browsers without WebSocket
        assertTrue('Skipping WebSocket test in this browser.', true);
        return;
      }

      var echo_data = null;
      var other_cb_called = false;

      queue.call(
        'Setup ws-client and make call',
        function(callbacks) {
          // Since the echo-server at echo.websockets.org won't give a correct JSON-RPC response,
          // we setup anonther onmessage catcher.
          var other_onmessage = callbacks.add(
            function(event) {
              echo_data = event.data;
            }
          );

          var other_cb = function(data) {
            other_cb_called = true;
          };

          var test = new $.JRPCClient({
            socketUrl: 'ws://echo.websocket.org/',
            onmessage: other_onmessage
          });

          test.call('plebb', [ 'bar' ], other_cb, other_cb);
        }
      );

      queue.call(
        'Assert that onmessage is called and nothing else.',
        function() {
          assertFalse('Other callback should not be called.', other_cb_called);

          assertNotNull('Echo-server should return the request data.', echo_data);
        }
      );
    }
  }
);
