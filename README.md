#JSON-RPC 2.0 Client for HTTP and WebSocket backends

This plugin requires jquery.json.js to be available, or at least the methods $.toJSON and
$.parseJSON.

The plan is to make use of websockets if they are available, but work just as well with only
http if not.

Usage example:

```Javascript
var foo = new $.JsonRpcClient({ ajaxUrl: '/backend/jsonrpc' });
foo.call(
  'bar', [ 'A parameter', 'B parameter' ],
  function(result) { alert('Foo bar answered: ' + result.my_answer); },
  function(error)  { console.log('There was an error', error); }
);
```

##Batch calls

In HTTP you can batch calls by calling startBatch.  All call- and notify-requests will be batched
up, until you run endBatch.  When a WebSocket backend is available, the requests will be sent
immediately.

Example:

```Javascript
    var foo = new $.JsonRpcClient({ ajaxUrl: '/backend/jsonrpc' });
    foo.startBatch();
    foo.call('bar', [ 'A parameter', 'B parameter' ], success_cb1, error_cb1);
    foo.call('baz', { parameters: 'could be object' }, success_cb2, error_cb2);
    foo.endBatch(function(all_result_array) { alert('All done.'); }, error_cb3);
```

Each result will be paired with it's own callback.  The callback in endBatch is called when all
other callbacks are done.


##WebSocket

If a websocket backend is given, it will be used if the browser supports it:

```Javascript
var foo = new $.JsonRpcClient({ ajaxUrl: '/backend/jsonrpc', socketUrl: 'ws://example.com/' });
foo.call('bar', [ 'param' ], success_cb, error_cb);
--> websocket message: {"jsonrpc":"2.0","method":"bar","params":["param"],"id":3}
```

The http fallback will be used when the browser is not WebSocket capable, but NOT when the
websocket fails to connect.


###WebSocket other message handler

If a non-response message comes in, it can be forwarded to an external handler by giving the
onmessage-option.


###Using an already alive websocket - getSocket option

If you already have a websocket active and want that to be used for the JSON-RPC requests, you can
use the getSocket option.  getSocket should point to a function with the following interface:
```
@param onmessage_cb  getSocket will be called with an onmessage_cb that must be bound to the
                     onmessage event of the returned socket.

@return websocket|null  The returned object should act like a WebSocket: it must have the
                        property readyState, with a value of less than or equal to 1.  If less
                        than 1, it must have an onopen-property that can be set, and that will
                        be called when the socket is ready.  Also, it must be have the function
                        'call', taking a string.
                        It could also return null if no socket is available.
```

The main purpose of this is to couple the client with a matching server, that can take requests
from the backend.


##Test

The test-file is supposed to be run with [JsTestDriver](https://code.google.com/p/js-test-driver/).


##JSON-RPC 2.0

JSON-RPC 2.0 is a very simple protocol for remote procedure calls, agnostic of carrier (http, websocket, tcp, whatever…).

[JSON-RPC 2.0 Specification](http://www.jsonrpc.org/specification)
