TestCase(
  "JsonRpcClientTest", {
    testNew: function() {
      var test = new $.JsonRpcClient({ ajaxUrl: '/foobar1' });
      assertObject('test should be a new object', test);
    }
  }
);

// Adding a function to replace jQuery.ajax with for callbacks.
// It acts as a HTTP JSON-RPC 2.0 backend that returns the whole request as result for a request,
// and nothing for a notify.
function mock_jquery_ajax(params) {
  var data = $.parseJSON(params.data);

  // Is this a batch call?  Mocking a little differently.
  if (typeof data === 'object' && Array.isArray(data)) {
    var response = [];

    for (var i = 0; i < data.length; i++) {
      var subdata = data[i];

      // Fake a json-rpc error if the method is make_error.
      if (subdata.method === 'make_error') {
        response.push({
          jsonrpc : '2.0',
          id      : subdata.id,
          error: {
            code    : -42,
            message : 'make_error made an error.',
            data    : subdata.params
          }
        });
      }
      else if ('id' in subdata) {
        response.push({
          jsonrpc : '2.0',
          id      : subdata.id,
          result  : subdata.params
        });
      }
    }

    params.success(response);
  }

  // Fake a json-rpc error if the method is make_error.
  if (data.method === 'make_error') {
    // The AJAX call is successfull, it's up to JsonRpcClient to parse this as an error.
    params.success({
      jsonrpc: '2.0',
      id: params.id,
      error: {
        code    : -42,
        message : 'make_error made an error.',
        data    : params
      }
    });
  }

  // Call the success-callback if there is an id.
  if ('id' in data) {
    params.success({
      jsonrpc : '2.0',
      id      : data.id,
      result  : params
    });
  }
}

AsyncTestCase(
  'JsonRpcClientAsyncTest', {
    testBadBackend: function(queue) {
      // Setup a test client with a bad backend
      var test = new $.JsonRpcClient({ ajaxUrl: '/foobar2' });
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
      // Test that a non-existing backend gives the overall error_cb, and that the individual
      // callbacks are not called.
      var test = new $.JsonRpcClient({ ajaxUrl: '/foobar3' });
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

          test.batch(
            function(batch) {
              batch.call('foo', [], other_cb, other_cb);
              batch.call('bar', [], other_cb, other_cb);
              batch.call('baz', [], other_cb, other_cb);
            },
            other_cb, main_error_cb
          );
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

    testBatchHttp: function(queue) {
      // Test that both calls in the batch are given their respective data no matter the order of
      // the results, with call 3 getting an error.
      var test = new $.JsonRpcClient({ ajaxUrl: '/backend/Article/17094007' });

      // Save the normal jQuery.ajax.
      var saved_jquery_ajax = jQuery.ajax;

      var all_done_cb_called = false;
      var call1_data         = undefined;
      var call2_data         = undefined;
      var call3_errorcb_data = undefined;
      var other_cb_called    = false;

      queue.call(
        'Step 1: register ajax callback.',
        function(callbacks) {
          // Replace jQuery.ajax with a mocked function.
          jQuery.ajax = callbacks.add(mock_jquery_ajax);

          //
          var all_done_cb = callbacks.add(
            function(given_result) {
              all_done_cb_called = true;
            }
          );

          var call1_cb = callbacks.add(
            function(given_result) {
              call1_data = given_result;
            }
          );

          var call2_cb = callbacks.add(
            function(given_result) {
              call2_data = given_result;
            }
          );

          var call3_errorcb = callbacks.add(
            function(given_result) {
              call3_errorcb_data = given_result;
            }
          );

          var other_cb = function() { other_cb_called = true; };

          test.batch(
            function(batch) {
              batch.call('foo', [ 1 ], call1_cb, other_cb);
              batch.call('bar', [ 2 ], call2_cb, other_cb);
              batch.call('make_error', [ 3 ], other_cb, call3_errorcb);
            },
            all_done_cb, other_cb
          );
        }
      );

      queue.call(
        'Step 2: check that callback has been called correctly.',
        function() {
          assertTrue(
            'all_done_cb should be called.',
            all_done_cb_called
          );
          assertEquals(
            'call1 should get the parameter list [ 1 ]',
            [ 1 ],
            call1_data
          );
          assertEquals(
            'call2 should get the parameter list [ 2 ]',
            [ 2 ],
            call2_data
          );
          assertEquals(
            'call3_errorcb should be given code -42.',
            -42,
            call3_errorcb_data.code
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
      var test = new $.JsonRpcClient({ ajaxUrl: given_url });

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
      var test = new $.JsonRpcClient({ ajaxUrl: given_url });

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
      var test = new $.JsonRpcClient({
        ajaxUrl: given_http_url,
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
      var wanted_result = 'A valid result.';
      var gotten_result = null;

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

          // The succes_cb, called bu the echo of our hand-crafter send below.
          var success_cb = callbacks.add(
            function(result) {
              gotten_result = result;
            }
          );

          var other_cb = function(data) {
            other_cb_called = true;
          };

          var test = new $.JsonRpcClient({
            socketUrl: 'ws://echo.websocket.org/',
            onmessage: other_onmessage
          });

          // Send a request with the client.  It will be echoed, and the echo will count as other
          // message.
          test.call('plebb', [ 'bar' ], success_cb, other_cb);

          // Send the response via the client internal socket, to get the echo-server to send it
          // back to us.
          var old_onopen = test._ws_socket.onopen;
          test._ws_socket.onopen = function(event) {
            old_onopen(event); // chain in the already added onopen handler.
            test._ws_socket.send($.toJSON({
              jsonrpc: '2.0',
              result: wanted_result,
              id: test._current_id - 1 // match the last requests id
            }));
          };
        }
      );

      queue.call(
        'Assert that onmessage is called and nothing else.',
        function() {
          assertFalse('Other callback should not be called.', other_cb_called);

          assertNotNull('Echo-server should return the request data.', echo_data);

          assertEquals('The result should be parsed and send to success_cb.',
                       gotten_result, wanted_result);
        }
      );
    },

    testWebsocketOnError: function(queue) {
      var error_gotten = null;

      jstestdriver.plugins.async.CallbackPool.TIMEOUT = 1000;

      queue.call(
        'Setup ws-client and make call',
        function(callbacks) {
          var onerror_cb = callbacks.add(
            function(error) {
              error_gotten = error;
            }
          );

          // Save the existing WebSocket, if any.
          var savedWebSocket = null;

          if ('WebSocket' in window) { savedWebSocket = window.WebSocket; }

          // Mock a websocket-like object and patch it in!
          window.WebSocket = function(url) {
            this.onopen     = null;
            this.onmessage  = null;
            this.onclose    = null;
            this.onerror    = null;

            this.send = function(data) {
              // Make all send requests cause an error.
              if (typeof this.onerror === 'function') {
                this.onerror("Sending of data failed!");
              }
            };
          };

          var client = new $.JsonRpcClient({
            socketUrl: 'ws://echo.websocket.org/',
            onerror: onerror_cb
          });

          // Send a request with client.  This should trigger the socket onerror_cb.
          client.notify('foo', []);

          // Restore the real WebSocket.
          if (typeof savedWebSocket === 'function') {
            window.WebSocket = savedWebSocket;
          }
        }
      );

      queue.call(
        'Assert that onerror is called.',
        function() {
          assertEquals('Sending of data failed!', error_gotten);
        }
      );
    },

    //test that messages that don't parse as JSON is passed along
    //to fallback message handler, see issue 14
    testWebsocketJSONErrorPassthrough: function(queue) {
      var data_gotten = null;

      jstestdriver.plugins.async.CallbackPool.TIMEOUT = 1000;

      queue.call(
        'Setup ws-client and make call, mocking a non JSON response',
        function(callbacks) {
          var onmessage_cb = callbacks.add(
            function(data) {
              data_gotten = data;
            }
          );

          // Save the existing WebSocket, if any.
          var savedWebSocket = null;

          if ('WebSocket' in window) { savedWebSocket = window.WebSocket; }

          // Mock a websocket-like object and patch it in!
          window.WebSocket = function(url) {
            this.onopen    = null;
            this.onmessage = null;
            this.onclose   = null;
            this.onerror   = null;
            this.readyState = 1;

            this.send = function(data) {
              //response is a fake json response
              this.onmessage({ data: 'this is not JSON' });
            };
          };

          var client = new $.JsonRpcClient({
            socketUrl: 'ws://localhost/',
            onmessage: onmessage_cb
          });

          // Send a request with client.  This should trigger the socket onmessage_cb.
          client.notify('foo', []);

          // Restore the real WebSocket.
          if (typeof savedWebSocket === 'function') {
            window.WebSocket = savedWebSocket;
          }
        }
      );

      queue.call(
        'Assert that onmessage is called.',
        function() {
          assertEquals('this is not JSON', data_gotten.data);
        }
      );
    },

    //errors in callback should not be consumed silently
    //see issue 14
    testWebsocketCallbackError: function(queue) {
      var error_gotten = null;
      jstestdriver.plugins.async.CallbackPool.TIMEOUT = 1000;

      queue.call(
        'Setup ws-client and make call, mocking a response',
        function(callbacks) {

          // Save the existing WebSocket, if any.
          var savedWebSocket = null;

          if ('WebSocket' in window) { savedWebSocket = window.WebSocket; }

          // Mock a websocket-like object and patch it in!
          window.WebSocket = function(url) {
            this.onopen    = null;
            this.onmessage = null;
            this.onclose   = null;
            this.onerror   = null;
            this.readyState = 1;

            this.send = function(data) {
              var that = this;
              setTimeout(function(){
                //fake a json response
                that.onmessage({ 
                  data: $.toJSON({
                    jsonrpc: "2.0",
                    id: $.parseJSON(data).id,
                    result: "foobar"
                  })
                });
              },0);
            };
          };

          var client = new $.JsonRpcClient({
            socketUrl: 'ws://localhost/',
            onmessage: callbacks.addErrback('onmessage'),
            onerror: callbacks.addErrback('onerror'),
          });

          // Send a request with client.  This should trigger an exception
          // this "works" since our WebSocket mock is synchronous
          // in production this will just end up as an error in the browser
          var error = new Error('Dude, not again');

          window.onerror = callbacks.add(function(msg){
            error_gotten = msg;
          });  
          client.call('foo', [],function(){
            //ooops we have a bug in our callback!
            throw error;
          },callbacks.addErrback());
          

          // Restore the real WebSocket.
          if (typeof savedWebSocket === 'function') {
            window.WebSocket = savedWebSocket;
          }
        }
      );

      queue.call(
        'Assert that onmessage is called.',
        function() {
          //chrome prepends 'Uncaught Error:', Firefox prepends 'Error'
          assertEquals(' Dude, not again', error_gotten.split(':')[1]);
          window.onerror = null;
        }
      );
    }
  }
);
