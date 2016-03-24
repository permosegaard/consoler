"use strict";

// TODO: improve performance with http://apmblog.dynatrace.com/2016/01/14/how-to-track-down-cpu-issues-in-node-js/

//require( "cache-require-paths" );
//require( "cache-require-source" );

// imports here
var fs = require( "fs" ),
	df = require( "df" ),
	sleep = require( "sleep" ),
	netping = require( "net-ping" ),
	netstat = require( "net-stat" ),
	diskstat = require( "disk-stat" ),
	cpustats = require( "cpu-stats" ),
	nodeproc = require( "node-proc" ),
	childprocess = require( "child_process" ),
	v8profiler = require( "v8-profiler" ),
	chrome2calltree = require( "chrome2calltree" ),
	memstream = require( "memory-streams" ),
	blessed = require( "blessed" ),
	blessedcontrib = require( "blessed-contrib" );

// globals here
var terminal_reference = null;

process.on( "SIGUSR1", function() {
	var path = "/tmp/consoler.callgrind.out";
	try { fs.accessSync( path , fs.F_OK ); } // eurgh
	catch ( exception ) {
		v8profiler.startProfiling();
		setTimeout( function() {
			var converted = new memstream.WritableStream();
			chrome2calltree.chromeProfileToCallgrind( v8profiler.stopProfiling(), converted );
			fs.writeFileSync( path, converted );
		}, 60000 );
	}
});

/* layout here */
var screen = blessed.screen({ sendFocus: true, fastCSR: true, fullUnicode: false, forceUnicode: true, dockBorders: false, ignoreLocked: [ "C-q" ] });
screen.on( "focus", function() { terminal_reference.focus(); } ); // needs testing
screen.key( "C-q", function() { process.exit( 0 ); });
screen.key( "f9", function() { if ( views_menu.selected > 0 ) { views_menu.selectTab( views_menu.selected - 1 ); } } );
screen.key( "f10", function() { if ( views_menu.selected < ( views_menu.commands.length - 1 ) ) { views_menu.selectTab( views_menu.selected + 1 ); } } );
screen.key( "f11", stats_panel_show );
screen.key( "f12", actions_panel_show );

var views_box = blessed.box({ parent: screen, top: 1, left: 2, height: "100%-2", width: "100%-4", border: "line", style: { border: { fg: "#602060" } } });

var views_quickbar = blessed.box({ parent: screen, top: 0, left: "center", height: 3, width: 102, border: "line", style: { border: { fg: "#602060" } } });
var views_quickbar_blanker = blessed.box({ parent: views_quickbar, top: "center", left: "center", height: 3, width: 100 })

var views_menu = blessed.listbar({
	parent: views_quickbar,
	left: "center", top: 0, height: 1, width: 98,
	mouse: true, keys: false, autoCommandKeys: false,
	style: { selected: { bg: "blue", fg: "white" } },
	commands: {
		"monitoring": { callback: function() { terminal_create( [ __dirname + "/scripts/monitoring.sh" ] ); } },
		"calendar": { callback: function() { terminal_create( [ __dirname + "/scripts/calendar.sh" ] ); } },
		"to-do": { callback: function() { terminal_create( [ __dirname + "/scripts/todo.sh" ] ); } },
		"email": { callback: function() { terminal_create( [ __dirname + "/scripts/email.sh" ] ); } },
		"rss": { callback: function() { terminal_create( [ __dirname + "/scripts/rss.sh" ] ); } },
		"irc": { callback: function() { terminal_create( [ __dirname + "/scripts/irc.sh" ] ); } },
		"im": { callback: function() { terminal_create( [ __dirname + "/scripts/im.sh" ] ); } },
		"fun": { callback: function() {	terminal_create( [ __dirname + "/scripts/fun.sh" ] ); } },
		"shell": { callback: function() { terminal_create( [ __dirname + "/scripts/shell.sh" ] ); } }
	}
});

var stats_launch = blessed.box({ parent: screen, top: "center", left: -1, height: "100%", width: 2, border: "line", draggable: false, clickable: true, style: { border: { fg: "#800000" } } });
stats_launch.on( "click", stats_panel_show );

var stats_panel = blessed.box({ parent: screen, top: "center", left: 0, height: "100%", width: 30, hidden: true, border: "line", draggable: false, clickable: true, style: { border: { fg: "#800000" } } });

var stats_panel_cpu = blessedcontrib.gauge({ parent: stats_panel, label: "Processor:", top: 0, left: 0, height: 3, width: 28, showLabel: false });
stats_panel.append( stats_panel_cpu ); // sadly required due to lib code :(¬

var stats_panel_memory = blessedcontrib.gauge({ parent: stats_panel, label: "Memory Usage:", top: 5, left: 0, height: 3, width: 28, showLabel: false });
stats_panel.append( stats_panel_memory ); // sadly required due to lib code :(¬

var stats_panel_diskfree = blessedcontrib.gauge({ parent: stats_panel, label: "Storage Used:", top: 10, left: 0, height: 3, width: 28, stroke: "red", showLabel: false });
stats_panel.append( stats_panel_diskfree ); // sadly required due to lib code :(

var stats_panel_diskio = blessed.table({ parent: stats_panel, label: "Storage Rd/Wr:", top: 15, left: 0, height: 5, width: 28, pad: 0, noCellBorders: true })

var stats_panel_network = blessed.table({ parent: stats_panel, label: "Network Rx/Tx:", top: 22, left: 0, height: 5, width: 28, pad: 0, noCellBorders: true })

var stats_panel_proxies = blessed.table({ parent: stats_panel, label: "Proxies:", top: 29, left: 0, height: 5, width: 28, tags: true, pad: 0, noCellBorders: true })

var stats_panel_vpn_ping = blessedcontrib.sparkline({ parent: stats_panel, tags: true, bottom: 0, left: 1, height: 3, width: 27, style: { fg: "blue", titleFg: "white" } });

var actions_launch = blessed.box({ parent: screen, top: "center", right: 0, height: "100%", width: 1, border: "line", draggable: false, clickable: true, style: { border: { fg: "#800000" } } });
actions_launch.on( "click", actions_panel_show );

var actions_panel = blessed.box({ parent: screen, top: "center", right: 0, height: "100%", width: 30, hidden: true, border: "line", draggable: false, clickable: true, style: { border: { fg: "#800000" } } });

var actions_panel_list = blessed.list({ parent: actions_panel, top: "center", left: "center", height: "100%-2", width: "100%-2", tags: true, style: { selected: { fg: "white", bg: "blue" } }, draggable: false, mouse: true });
var actions_panel_list_items = [ 
	{ name: "{bold}SSH{/bold} > host", run: function() { actions_ssh( "host" ); } },
	{ name: "{bold}SSH{/bold} > development", run: function() { actions_ssh( "development" ); } },
	{ name: "{bold}SSH{/bold} > syslog", run: function() { actions_ssh( "syslog" ); } }
]
actions_panel_list.setItems( [ "┌─ {bold}Actions{/bold}" ].concat( actions_panel_list_items.map( function( object ) { return "├> " + object.name } ) ) );
actions_panel_list.on( "select", function( event ) { actions_panel_list_items[ actions_panel_list.selected - 1 ].run(); actions_panel_list.select( 0 ); } );

var views_content = blessed.box({ parent: views_box, top: 1, left: 1, height: "100%-3", width: "100%-4", draggable: false, clickable: false });

/* functions here */
function stats_panel_show()  { stats_panel.setIndex( 1000 ); stats_panel.show(); screen.render(); }
function actions_panel_show()  { actions_panel.setIndex( 1000 ); actions_panel.show(); screen.render(); actions_panel_list.focus(); }

function terminal_remove()  { if ( terminal_reference != null ) { terminal_reference.destroy(); terminal_reference = null; } }

function terminal_create( commands ) { terminal_set(); terminal_write( commands ); terminal_reference.focus(); screen.render(); }

function terminal_set() {
	if ( terminal_reference != null ) { terminal_remove(); }
	terminal_reference = blessed.terminal({
		parent: views_content,
		cursor: "block", /* cursorBlink: true, speed issue? */ cursorBlink: false,
		left: "center", top: "center", width: "100%", height: "100%",
		border: "line", style: { border: { fg: "black" } }, // required to work around mouse y pos bug w/out border
		clickable: true, draggable: false,
		shell: "/bin/sh"
	});
	terminal_reference.on( "focus", function() { stats_panel.hide(); actions_panel.hide(); });
}

function terminal_write( commands ) {
	if ( typeof commands !== 'undefined' ) {
		for ( var command in commands ) { terminal_reference.pty.write( commands[ command ] + "\n" ); }
	}
}

function _actions_tmux_window_cmd( name, command ) {
	var tmux = "/usr/bin/tmux -S ~/.tmux/outer.sock";
	childprocess.exec( tmux + " new-window -dP -n " + name + " " + command + " | xargs " + tmux + " select-window -t" );
	views_menu.selectTab( views_menu.commands.length - 1 );
}
function actions_ssh( host ) { _actions_tmux_window_cmd( host, "ssh " + host ); }
function actions_ssh_name( name, host ) { _actions_tmux_window_cmd( name, "ssh " + host ); }
function actions_ssh_manual( name, command ) { _actions_tmux_window_cmd( name, command ); }

function stats_panel_update_cpu() {
	try {
		cpustats( 20, function( error, results ) {
			var cpu_user = 0; var cpu_system = 0; var cpu_idle = 0;
			for ( var result in results ) {
				cpu_user += results[ result ][ "user" ] + results[ result ][ "nice" ];
				cpu_system += results[ result ][ "system" ] + results[ result ][ "irq" ];
				cpu_idle += results[ result ][ "idle" ];
			}
			stats_panel_cpu.setStack([
				{ percent: Math.floor( cpu_user / results.length ), stroke: "red" },
				{ percent: Math.floor( cpu_system / results.length ), stroke: "yellow" },
				{ percent: Math.floor( cpu_idle / results.length ), stroke: "green" }
			]);
		});
	}
	catch ( exception ) {}
}

function stats_panel_update_memory() {
	try {
		nodeproc.meminfo( function( error, result ) {
			stats_panel_memory.setStack([
				{ percent: Math.floor( result[ "Active" ] / result[ "MemTotal" ] * 100 ), stroke: "red" },
				{ percent: Math.floor( result[ "Buffers" ] + result[ "Cache" ] / result[ "MemTotal" ] * 100 ), stroke: "yellow" },
				{ percent: Math.floor( result[ "MemFree" ] / result[ "MemTotal" ] * 100 ), stroke: "green" }
			]);
		});
	}
	catch ( exception ) {}
}

function stats_panel_update_disk_usage() {
	try {
		df( function( error, results ) {
			for ( var result in results ) {
				if ( results[ result ][ "mountpoint" ] == "/" ) { stats_panel_diskfree.setPercent( results[ result ][ "percent" ] ); break;	}
			}
		});
	}
	catch ( exception ) {}
}

function stats_panel_update_disk_io() {
	try {
		diskstat.usageRead( { device: "mmcblk0p1", units: "KiB", sampleMs: 500 }, function( recieved_sample ) {
			diskstat.usageWrite( { device: "mmcblk0p1", units: "KiB", sampleMs: 500 }, function( transmitted_sample ) {
				stats_panel_diskio.setData([
					[ "Direction", "KB/s" ], [ "Read", Math.floor( recieved_sample ) + "" ], [ "Write", Math.floor( transmitted_sample ) + "" ]
				]);
			});
		});
	}
	catch ( exception ) {}
}

function stats_panel_update_network() {
	try {
		netstat.usageRx( { iface: "eth0", units: "KiB", sampleMs: 500 }, function( recieved_sample ) {
			netstat.usageTx( { iface: "eth0", units: "KiB", sampleMs: 500 }, function( transmitted_sample ) {
				stats_panel_network.setData([
					[ "Direction", "KB/s" ], [ "Rx", Math.floor( recieved_sample ) + "" ], [ "Tx", Math.floor( transmitted_sample ) + "" ]
				]);
			});
		});
	}
	catch ( exception ) {}
}

function stats_panel_update_proxies() {
	try {
		childprocess.exec( "source ~/.zshrc; proxy", { shell: "/usr/bin/zsh", timeout: 5000 }, function( error, stdout, stderr ) {
			if ( stdout.length > 3 ) {
				stats_panel_proxies.setData(
					[ [ "", "" ] ].concat(
						stdout.toString( "utf-8" ).split( "\n" ).filter( function( line ) {
							if ( line.length > 1 ) { return line; }
						}).map( function( line ) {
							var items = line.replace( " ", "" ).split( ":" );
							if ( items[ 1 ] == "online" )  { items[ 1 ] = "{green-fg}" + items[ 1 ] + "{/green-fg}" }
							else if ( items[ 1 ] == "offline" )  { items[ 1 ] = "{red-fg}" + items[ 1 ] + "{/red-fg}" }
							return items;
						})
					) 
				);
			}
		});
	}
	catch ( exception ) {}
}

var stats_panel_vpn_ping_data = [];
function stats_panel_update_latency() {
	try {
		netping.createSession({ packetSize: 16, retries: 0, timeout: 1000, ttl: 128 }).pingHost( "127.0.0.1", function( error, target, sent, rcvd ) {
			if ( stats_panel_vpn_ping_data.length > 100 ) { stats_panel_vpn_ping_data = []; } // leaks are bad m-kay
			if ( error ) { stats_panel_vpn_ping_data.unshift( 10000 ); }
			else { stats_panel_vpn_ping_data.unshift( rcvd.getTime() - sent.getTime() ) } 
			stats_panel_vpn_ping.setData( [ "Concentrator latency" ], [ stats_panel_vpn_ping_data ] );
		} );
	}
	catch( exception ) {}
}


/* initial page render here */
views_menu.selectTab( 0 );
screen.render();


/* updaters here */
setTimeout( function() {
	
	stats_panel_update_cpu();
	stats_panel_update_memory();
	stats_panel_update_disk_usage();
	stats_panel_update_disk_io();
	stats_panel_update_network();
	stats_panel_update_proxies();
	stats_panel_update_latency();
	
	setInterval( function() { screen.render(); }, 5000 );
	
	setInterval( function() {
		stats_panel_update_cpu();
		stats_panel_update_disk_io();
		stats_panel_update_network();
		stats_panel_update_latency();
	}, 5000 );

	setInterval( function() {
		stats_panel_update_memory();
		stats_panel_update_disk_usage();
		stats_panel_update_proxies();
	}, 300000 );
	
}, 100 );
