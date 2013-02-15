TestCase(
  "JRPCClientTest", {
    testNew: function() {
      var test = new $.JRPCClient({ http: '/foobar' });
      assertObject('test should be a new object', test);
    }
  }
);

AsyncTestCase(
  'JRPCClientAsyncTest', {
    testBadBackend: function(queue) {
      // Setup a test client with a bad backend
      var test = new $.JRPCClient({ http: '/foobar' });

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
    }
  }
);
