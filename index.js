/***
 *	In-Memory File Storage ( IMFS )
 *
 *  @ Writter: anysz < https://github.com/anysz >
 *	@ Context: memory, storage, http, rest, server
 *
 * Copyright (c) 2019. Anysz
 *
 *   TODO:
 *     Finishing REST API
 *
 *
 *
 */

const 
	FS_FILE = 0,
	FS_FOLDER = 1,
	FS_LINK = 2;

const 
	PERM_READ = 0,
	PERM_DELETE = 1,
	PERM_WRITE = 2,

	PERM_FORBIDDEN = 19, // If directory is indexing, object will not shown
	PERM_FORCE_READ = 20, // Even if the directory not allowed to read (list/indexing)

	PERM_ALL = 99;

const models = require('./models.js');
const {
	Array,
	File, Directory, Link, AccessGateway,
} = models;
const 
	fs = require('fs'),
	express = require('express'),
	xml = require('xml');


let app = express();

// Create Virtual File Storage
let roots = new Directory('roots');
let ifiles = [
	new File('index', '<h1>Welcome!</h1>'),
	new File('haroe', 'hehehehhe'),
	new File('forbid', 'This is forbid', [19]),
];
let sub_dir1 = new Directory('sub1', [PERM_FORCE_READ]);
sub_dir1.adds([
	new File('mantul.txt', 'mantul-mantul'),
	new File('Teaspoon.txt','teaspooonks'),
	new Link('your_head.txt', '../haroe'),
]);
roots.adds(ifiles);
roots.add(sub_dir1);

let sub_dir2 = new Directory('sub2', [PERM_FORCE_READ]);
sub_dir2.copy(sub_dir1);
sub_dir1.add(sub_dir2);

//Hook with MVFS
const MVFS = new AccessGateway(roots);

app.use((req,res,next)=>{
	let rpth = req._parsedUrl.pathname;
	req.access_path = rpth.substring(1,rpth.length);
	next();
});
//CORS
app.use((req,res,next)=>{
	res.set({
		'server': 'IMFS',
		'x-server': 'IMFS',
		'access-control-allow-origin': ['*'],
		'access-control-allow-methods': 'GET,POST,DELETE,PUT',
		'access-control-allow-headers': 'Content-Type',
	});
	next();
});

//Main
const Errors = {
	200: {
		Code: "OK",
		Message: "OK",
	},
	403: {
		Code: "AccessDenied",
		Message: "Access Denied",
	},
	404: {
		Code: "NotFound",
		Message: "Not Found",
	},
	301: {
		Code: "Redirect",
		Message: "Redirect",
	}
}
let errors = (req,res, ret_code, addt=[], pcat='Error')=>{
	const retsx = Errors[ret_code]
	let jxw = {};
	jxw[pcat] = [
		{ Code: retsx.Code, },
		{ Message: retsx.Message, },
		{ RequestId: `${(new Date).getTime() - 1551930000000}`, },
		...addt
	]
	res.status(ret_code).set('Content-Type','text/xml').send(xml(jxw));
}, xmlNesting = (OO,Key)=>{
	return OO.map(xxs => {
		let p = {};p[Key] = xxs;return p;
	});
};
let index_prsv = (req,res) => errors(req,res, 403)
app.get('/', index_prsv);
app.post('/',index_prsv);
app.put('/', index_prsv);
app.delete('/', index_prsv);

//API
let api_router = express.Router();
api_router.get('/auth', (req,res)=>{
	res.send('authentication here');
});
api_router.get('/ls', (req,res)=>{
	res.send(roots)
});
//Web Client
let web_router = express.Router();
web_router.get('/',(req,res)=>{

});
//Directory
app.use(['/api','/-'], api_router);
app.use('/web', web_router)

// REST Service
app.put('*', (req,res)=>{
	console.log('Put path:', req.access_path);
	res.send('k');
});
app.get('*', (req,res)=>{
	console.log('Access path:', req.access_path);
	const fs_lookup = MVFS.get(req.access_path);
	if(fs_lookup.success == true){
		let data;
		try{
			data = fs_lookup.data.list();
		}catch(e){
			data = fs_lookup.data.get();
		}
		let opts = data.opts;

		if(data.status == true || data.success == true){
			if(opts.type == FS_FILE){
				res.send(data.raw);
			}else if(opts.type == FS_FOLDER){
				if(fs_lookup.data.perms.contains([ PERM_READ, PERM_FORCE_READ ])){
					let sx = [];
					for(const xO of data.list){
						let xi = [
							{type: (xO.fs == 0) ? 'FILE' : ( (xO.fs == 1) ? 'DIRECTORY' : 'LINK' )},
							{name: xO.name,},
						];
						if(typeof xO.size != 'undefined'){ xi.push({size: xO.size}); }
						if(typeof xO.link != 'undefined'){ xi.push({original: xO.link}); }
						xi.push({permissions: xO.perms,});
						sx.push(xi);
					}
					//res.send({
					//	status: 200, results: sx
					//});
					errors(req,res,200, [{
						Object: [
							{Name: opts.name},
							{Contains: xmlNesting(sx.sort(), 'Object')}
						],
					}], 'Result')
				}else{
					errors(req,res, 403, [{
						Object: [
							{Reason: "Directory indexing setting disabled"},
							{Permissions: xmlNesting(fs_lookup.data.perms, 'Permission')},
						],
					}]);
				}
			}else if(opts.type == FS_LINK){
				//res.status(301).set({'Location': data.redirect}).send({status: [301, 302], reason: "Redirecting...", permissions: data.opts.perms});
				res.set('Location', data.redirect);
				errors(req,res, 301, [{
					Location: data.redirect,
					Permissions: xmlNesting(data.opts.perms, 'Permission'),
				}])
			}
		}else{
			//res.send({status: 403, reason: data.opts.reason, permissios: data.opts.perms})
			errors(req,res, 403, [{
				Object: [
					{Reason: data.opts.reason},
					{Permissions: xmlNesting(data.opts.perms, 'Permission') }
				],
			}])
		}
	}else{
		errors(req,res, 404);
	}
});
app.post('*', (req,res)=>{
	console.log('Update path:', req.access_path);
	res.send('k');
})
app.delete('*', (req,res)=>{
	console.log('Delete path:', req.access_path);
	res.send('k');
});

process.on('uncaughtException', function(e){
	console.log('[!!!!] Error [!!!!!]')
	console.log(e);
	console.log('========================')
});

app.set('x-powered-by', false);

app.listen(process.env.PORT || 3030, ()=> {
	console.log(`Application start at ${(process.env.PORT || 3030)}`);
});