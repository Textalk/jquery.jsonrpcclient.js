JSON-RPC 2.0 Client for HTTP and WebSocket backends
===================================================

This plugin requires jquery.json.js to be available, or at least the methods $.toJSON and
$.parseJSON.

The plan is to make use of websockets if they are available, but work just as well with only
http if not.

Usage example:

    var foo = new $.JRPCClient({ http: '/backend/jsonrpc' });
    foo.call(
      'bar', [ 'A parameter', 'B parameter' ],
      function(result) { alert('Foo bar answered: ' + result.my_answer); },
      functoin(error)  { console.log('There was an error', error); }
    );


Batch calls
-----------

In HTTP you can batch calls by calling startBatch.  All call- and notify-requests will be batched
up, until you run endBatch.  When a WebSocket backend is available, the requests will be sent
immediately.

Example:

    var foo = new $.JRPCClient({ http: '/backend/jsonrpc' });
    foo.startBatch();
    foo.call('bar', [ 'A parameter', 'B parameter' ], success_cb1, error_cb1);
    foo.call('baz', { parameters: 'could be object' }, success_cb2, error_cb2);
    foo.endBatch(function(all_result_array) { alert('All done.'); }, error_cb3);


Each result will be paired with it's own callback.  The callback in endBatch is called when all
other callbacks are done.

If a websocket backend is given, it will be used if the browser supports it:

    var foo = new $.JRPCClient({ http: '/backend/jsonrpc', ws: 'ws://example.com/' });
    foo.call('bar', [ 'param' ], success_cb, error_cb);
    --> websocket message: {"jsonrpc":"2.0","method":"bar","params":["param"],"id":3}


The http fallback will be used when the browser is not WebSocket capable, but NOT when the
websocket fails to connect.
