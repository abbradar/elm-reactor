(function() {
'use strict';

function assert(bool, msg)
{
	if (!bool)
	{
		throw new Error("Assertion error: " + msg);
	}
}


// SETUP SIDE BAR

function setupSideBar()
{
	var div = document.createElement('div');
	document.body.appendChild(div);

	var sideBar = Elm.embed(Elm.SideBar, div, {
		watches: [],
		model: {
			paused: false,
			total: 0,
			index: 0
		}
	});

	var api = {
		controls: function() {
		},
		sendWatches: function(watches) {
			sideBar.ports.watches.send(watches);
		},
		sendModel: function(model) {
			sideBar.ports.model.send(model);
		},
		reportErrors: function(errors) {
			sideBar.ports.errors.send(errors);
		}
	};

	sideBar.ports.controls.subscribe(function(value) {
		api.controls(value);
	});

	return api;
}


function handleControls(debugState)
{
	return function(action) {
	});
}




// CODE TO SET UP A MODULE FOR DEBUGGING

Elm.fullscreenDebug = function(moduleName, fileName) {

	var div = document.createElement('div');
	document.body.appendChild(div);

	var sideBar = setupSideBar();

	var result = embedModule(moduleName, div);

	sideBar.controls = handleControls(result.debugState);

	// handle swaps
	var connection = new WebSocket('ws://' + window.location.host + '/socket?file=' + fileName);
	connection.addEventListener('message', function(event) {
		result = swap(event.data, result, div, sideBar.reportErrors);
		sideBar.controls = handleControls(result.debugState);
	});
	window.addEventListener("unload", function() {
		connection.close();
	});

	return result.module;
};


function embedModule(moduleName, div)
{
	var debugState;

	function make(localRuntime)
	{
		var result = wrapRuntime(getModule(moduleName), localRuntime);
		debugState = result.debugState;
		return result.values;
	}

	return {
		module: Elm.embed({ make: make }, div),
		debugState: debugState
	};
}


function getModule(moduleName)
{
	var elmModule = Elm;
	var names = moduleName.split('.');
	for (var i = 0; i < names.length; ++i)
	{
		elmModule = elmModule[names[i]];
	}
	return elmModule;
}


// DEBUG STATE

function initDebugState(paused, pausedAtTime, totalTimeLost, index, events)
{
	return {
		paused: paused,
		pausedAtTime: pausedAtTime,
		totalTimeLost: totalTimeLost,

		index: index,
		events: events,
		watches: [{}],
		snapshots: [],
		asyncCallbacks: [],

		initialSnapshot: [],
		initialAsyncCallbacks: [],
		signalGraphNodes: [],

		swapInProgress: false,
	};
}


function update(action, model)
{
	if (action.tag === 'pause')
	{
		pause(debugState);
	}
	else if (action.tag === 'play')
	{
		unpause(debugState);
	}
	else if (action.tag === 'restart')
	{
		restart(debugState);
	}
	else if (action.tag === 'scrub')
	{
		jumpTo(action.value, debugState);
	}
	else if (action.tag === 'notify')
	{

	}
}

function pause(debugState)
{
	debugState.paused = true;
	debugState.pausedAtTime = Date.now();
}


function unpause(debugState)
{
	debugState.paused = false;

	// add delay due to the pause itself
	var pauseDelay = Date.now() - debugState.pausedAtTime;
	debugState.totalTimeLost += pauseDelay;

	// add delay if travelling to older event
	if (debugState.index < debugState.events.length - 1)
	{
		debugState.totalTimeLost = Date.now() - debugState.events[debugState.index].time;
	}

	// clear out future snapshots, events, and traces
	var nearestSnapshotIndex = Math.floor(debugState.index / EVENTS_PER_SAVE);
	debugState.snapshots = debugState.snapshots.slice(0, nearestSnapshotIndex + 1);
	debugState.events = debugState.events.slice(0, debugState.index);
	clearWatchesAfter(debugState.index, debugState);
}


function jumpTo(index, debugState)
{
	if (!debugState.paused)
	{
		pause(debugState);
	}

	assert(
		0 <= index && index <= debugState.events.length,
		"Trying to step to non-existent event index " + index
	);

	var potentialIndex = indexOfSnapshotBefore(index);
	if (index < debugState.index || potentialIndex > debugState.index)
	{
		var snapshot = getNearestSnapshot(index, debugState.snapshots);

		for (var i = debugState.signalGraphNodes.length; i-- ; )
		{
			debugState.signalGraphNodes[i].value = snapshot[i].value;
		}

		debugState.index = potentialIndex;
	}

	while (debugState.index < index)
	{
		var event = debugState.events[debugState.index];
		debugState.notify(event.id, event.value);
		debugState.index += 1;
	}
	redoTraces(debugState);
}


function swap(rawJsonResponse, oldResult, div, reportErrors)
{
	var response = JSON.parse(rawJsonResponse);

	reportErrors(response.error ? null : response.error);
	if (!response.code)
	{
		return oldResult;
	}
	// TODO: pause/unpause?
	pauseAsyncCallbacks(oldResult.debugState);
	window.eval(response.code);

	oldResult.module.dispose();

	var result = embedModule(response.name, div);
	transferState(oldResult.debugState, result.debugState);
	return result;
}


function transferState(previousDebugState, debugState)
{
	debugState.swapInProgress = true;
	debugState.events = previousDebugState.events;

	if (previousDebugState.paused)
	{
		debugState.paused = true;
		pauseAsyncCallbacks(debugState);
		debugState.pausedAtTime = previousDebugState.pausedAtTime;
		debugState.totalTimeLost = previousDebugState.totalTimeLost;
		addEventBlocker(debugState.node);
	}

	while (debugState.index < debugState.events.length)
	{
		var event = debugState.events[debugState.index];
		debugState.index += 1;
		pushWatchFrame(debugState);
		debugState.notify(event.id, event.value);
		snapshotIfNeeded(debugState);
	}
	redoTraces(debugState);
	debugState.swapInProgress = false;

	jumpTo(previousDebugState.index, debugState);
}


// SNAPSHOTS

var EVENTS_PER_SAVE = 100;

function snapshotIfNeeded(debugState)
{
	if (debugState.index % EVENTS_PER_SAVE === 0)
	{
		debugState.snapshots.push(createSnapshot(debugState.signalGraphNodes));
	}
}

function indexOfSnapshotBefore(index)
{
	return Math.floor(index / EVENTS_PER_SAVE) * EVENTS_PER_SAVE;
}

function getNearestSnapshot(i, snapshots)
{
	var snapshotIndex = Math.floor(i / EVENTS_PER_SAVE);
	assert(
		snapshotIndex < snapshots.length && snapshotIndex >= 0,
		"Trying to access non-existent snapshot (event " + i + ", snapshot " + snapshotIndex + ")"
	);
	return snapshots[snapshotIndex];
}

function createSnapshot(signalGraphNodes)
{
	var nodeValues = [];

	signalGraphNodes.forEach(function(node) {
		nodeValues.push({ value: node.value, id: node.id });
	});

	return nodeValues;
}

function flattenSignalGraph(nodes)
{
	var nodesById = {};

	function addAllToDict(node)
	{
		nodesById[node.id] = node;
		node.kids.forEach(addAllToDict);
	}
	nodes.forEach(addAllToDict);

	var allNodes = Object.keys(nodesById).sort(compareNumbers).map(function(key) {
		return nodesById[key];
	});
	return allNodes;
}

function compareNumbers(a, b)
{
	return a - b;
}


// WRAP THE RUNTIME

function wrapRuntime(elmModule, runtime)
{
	var debugState = emptyDebugState();

	// runtime is the prototype of wrappedRuntime
	// so we can access all runtime properties too
	var wrappedRuntime = Object.create(runtime);
	wrappedRuntime.notify = notifyWrapper;
	wrappedRuntime.setTimeout = setTimeoutWrapper;

	// make a copy of the wrappedRuntime
	var assignedPropTracker = Object.create(wrappedRuntime);
	var values = elmModule.make(assignedPropTracker);

	// make sure the signal graph is actually a signal & extract the visual model
	var Signal = Elm.Signal.make(assignedPropTracker);
	if ( !('notify' in values.main) )
	{
		values.main = Signal.constant(values.main);
	}
	A2(Signal.map, makeTraceRecorder(debugState, assignedPropTracker), values.main);

	debugState.refreshScreen = function() {
		var main = values.main
		for (var i = main.kids.length ; i-- ; )
		{
			main.kids[i].notify(runtime.timer.now(), true, main.id);
		}
	};

	// The main module stores imported modules onto the runtime.
	// To ensure only one instance of each module is created,
	// we assign them back on the original runtime object.
	Object.keys(assignedPropTracker).forEach(function(key) {
		runtime[key] = assignedPropTracker[key];
	});

	debugState.signalGraphNodes = flattenSignalGraph(wrappedRuntime.inputs);
	debugState.initialSnapshot = createSnapshot(debugState.signalGraphNodes);
	debugState.snapshots = [debugState.initialSnapshot];
	debugState.initialAsyncCallbacks = debugState.asyncCallbacks.map(function(callback) {
		return callback.thunk;
	});
	debugState.node = runtime.node;
	debugState.notify = runtime.notify;

	// Tracing stuff
	var replace = Elm.Native.Utils.make(assignedPropTracker).replace;

	runtime.timer.now = function() {
		if (debugState.paused || debugState.swapInProgress)
		{
			console.log('now', debugState.index, debugState.events.length);
			var event = debugState.events[debugState.index];
			return event.time;
		}
		return Date.now() - debugState.totalTimeLost;
	};

	runtime.debug = {};

	runtime.debug.trace = function(tag, form) {
		return replace([['trace', tag]], form);
	}

	runtime.debug.watch = function(tag, value) {
		if (debugState.paused && !debugState.swapInProgress)
		{
			return;
		}
		var index = debugState.index;
		var numWatches = debugState.watches.length;
		assert(
			index === numWatches - 1,
			'the current index (' + index + ') should point to the last of '
			+ numWatches + ' watch frames'
		);
		debugState.watches[debugState.index][tag] = value;
	}

	function notifyWrapper(id, value)
	{
		// Ignore all events that occur while the program is paused.
		if (debugState.paused)
		{
			return false;
		}

		// Record the event
		debugState.events.push({ id: id, value: value, time: runtime.timer.now() });
		debugState.index += 1;
		pushWatchFrame(debugState);
		console.log(debugState.index, debugState.events.length);

		var changed = runtime.notify(id, value);

		snapshotIfNeeded(debugState);
		addTraces(debugState);

		return changed;
	}

	function setTimeoutWrapper(thunk, delay)
	{
		if (debugState.paused)
		{
			return 0;
		}

		var callback = {
			thunk: thunk,
			id: 0,
			executed: false
		};

		callback.id = setTimeout(function() {
			callback.executed = true;
			thunk();
		}, delay);

		debugState.asyncCallbacks.push(callback);
		return callback.id;
	}

	return {
		values: values,
		debugState: debugState
	};
}


// WATCHES

function watchesAt(index, debugState)
{
	var watchSnapshot = [];
	var watches = debugState.watches[index];

	for (var name in watches)
	{
		var value = prettyPrint(watches[name], "  ");
		watchSnapshot.push([ name, value ]);
	}
	return watchSnapshot;
}

function pushWatchFrame(debugState)
{
	var watches = debugState.watches;
	var length = watches.length;
	assert(length > 0, 'the watches tracker should never be empty')
	var oldFrame = watches[length - 1];
	var newFrame = {};
	for (var tag in oldFrame)
	{
		newFrame[tag] = oldFrame[tag];
	}
	watches.push(newFrame);
}

function clearWatchesAfter(index, debugState)
{
	debugState.watches = debugState.watches.slice(0, index + 1);
}

var prettyPrint = function() {

	var independentRuntime = {};
	var List;
	var ElmArray;
	var Dict;

	var toString = function(v, separator) {
		var type = typeof v;
		if (type === "function") {
			var name = v.func ? v.func.name : v.name;
			return '<function' + (name === '' ? '' : ': ') + name + '>';
		} else if (type === "boolean") {
			return v ? "True" : "False";
		} else if (type === "number") {
			return v.toFixed(2).replace(/\.0+$/g, '');
		} else if ((v instanceof String) && v.isChar) {
			return "'" + addSlashes(v) + "'";
		} else if (type === "string") {
			return '"' + addSlashes(v) + '"';
		} else if (type === "object" && '_' in v && probablyPublic(v)) {
			var output = [];
			for (var k in v._) {
				for (var i = v._[k].length; i--; ) {
					output.push(k + " = " + toString(v._[k][i], separator));
				}
			}
			for (var k in v) {
				if (k === '_') continue;
				output.push(k + " = " + toString(v[k], separator));
			}
			if (output.length === 0) return "{}";
			var body = "\n" + output.join(",\n");
			return "{" + body.replace(/\n/g,"\n" + separator) + "\n}";
		} else if (type === "object" && 'ctor' in v) {
			if (v.ctor.substring(0,6) === "_Tuple") {
				var output = [];
				for (var k in v) {
					if (k === 'ctor') continue;
					output.push(toString(v[k], separator));
				}
				return "(" + output.join(", ") + ")";
			} else if (v.ctor === "_Array") {
				if (!ElmArray) {
					ElmArray = Elm.Array.make(independentRuntime);
				}
				var list = ElmArray.toList(v);
				return "Array.fromList " + toString(list, separator);
			} else if (v.ctor === "::") {
				var output = '[\n' + toString(v._0, separator);
				v = v._1;
				while (v && v.ctor === "::") {
					output += ",\n" + toString(v._0, separator);
					v = v._1;
				}
				return output.replace(/\n/g,"\n" + separator) + "\n]";
			} else if (v.ctor === "[]") {
				return "[]";
			} else if (v.ctor === "RBNode" || v.ctor === "RBEmpty") {
				if (!Dict || !List) {
					Dict = Elm.Dict.make(independentRuntime);
					List = Elm.List.make(independentRuntime);
				}
				var list = Dict.toList(v);
				var name = "Dict";
				if (list.ctor === "::" && list._0._1.ctor === "_Tuple0") {
					name = "Set";
					list = A2(List.map, function(x){return x._0}, list);
				}
				return name + ".fromList " + toString(list, separator);
			} else {
				var output = "";
				for (var i in v) {
					if (i === 'ctor') continue;
					var str = toString(v[i], separator);
					var parenless = str[0] === '{' ||
									str[0] === '<' ||
									str[0] === "[" ||
									str.indexOf(' ') < 0;
					output += ' ' + (parenless ? str : "(" + str + ')');
				}
				return v.ctor + output;
			}
		}
		if (type === 'object' && 'notify' in v) return '<signal>';
		return "<internal structure>";
	};

	function addSlashes(str)
	{
		return str
			.replace(/\\/g, '\\\\')
			.replace(/\n/g, '\\n')
			.replace(/\t/g, '\\t')
			.replace(/\r/g, '\\r')
			.replace(/\v/g, '\\v')
			.replace(/\0/g, '\\0')
			.replace(/\'/g, "\\'")
			.replace(/\"/g, '\\"');
	}

	function probablyPublic(v)
	{
		var keys = Object.keys(v);
		var len = keys.length;
		if (len === 3
			&& 'props' in v
			&& 'element' in v) return false;
		if (len === 5
			&& 'horizontal' in v
			&& 'vertical' in v
			&& 'x' in v
			&& 'y' in v) return false;
		if (len === 7
			&& 'theta' in v
			&& 'scale' in v
			&& 'x' in v
			&& 'y' in v
			&& 'alpha' in v
			&& 'form' in v) return false;
		return true;
	}

	return toString;
}();


}());
