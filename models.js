Array.prototype.contains = function(elem,delim='or',sideback=false){
	if(typeof elem == 'object'){
		let last_ = -1;
		for(const el of elem){
			const chk = this.indexOf(el) > -1;
			if(last_ == -1){
				last_ = (sideback)? (!chk) :chk;
			}
			if(delim == 'or'){
				last_ = last_ || ((sideback)?(!chk):chk);
			}else{
				last_ = last_ && ((sideback)?(!chk):chk);
			}
		}
		return (last_ == -1) ? false : last_;
	}else{
		return ((sideback)?(!(this.indexOf(elem) > -1)) : (this.indexOf(elem) > -1) );
	}
};

//const oo = [1,2,3,4,5,6,7,8,9,10];
//console.log(oo.contains(4,'or', true));

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

const R = (i, a=true) =>{
	const px = {
		PERM_READ: 'READ_INDEXING',
		PERM_DELETE: 'DELETE_REMOVE',
		PERM_WRITE: 'WRITE_ADD',

		PERM_FORBIDDEN: 'FORBIDDEN',
		PERM_FORCE_READ: 'PUBLIC',

		PERM_ALL: 'ALL',
	};
	return ((a)?'':'NOT_') + px[i];
}

const 
	fs = require('fs'),
	path = require('path'),
	DS = path.sep;

class Link{
	constructor(name, link_to, perms=[ PERM_READ ]){
		this.fs = FS_LINK;
		this.name = name;
		this.link = link_to;
		this.perms = perms;
	}
	get(){
		if(this.perms.contains(PERM_READ)){
			return {success: true, redirect: this.link, opts:{ type: FS_LINK, filename: this.name, perms:this.perms} }
		}else{
			return {success: false, redirect: null, opts:{ type: FS_LINK, reason:'Not allowed to read', perms: this.perms } }
		}
	}
}

class File{
	constructor(name, data, perms=[ PERM_READ ]){
		this.fs = FS_FILE;
		this.name = name;
		this.data = data;
		this.size = ( data.length || null );
		this.perms = perms;
	}
	get(){
		if(this.perms.contains(PERM_READ)){
			return {success: true, raw: this.data, opts:{ type: FS_FILE, filename: this.name, perms: this.perms } };
		}else{
			return {success: false, raw: null, opts: { type: FS_FILE, reason: 'Not allowed to read', perms: this.perms } };
		}
	}
	save(to_file){
		fs.writeFileSync(to_file, this.data);
		return true;
	}
}

class Directory{
	// READ in DIR is for LISTING
	constructor(name, perms=[ PERM_READ ]){
		this.fs = FS_FOLDER;
		this.name = name
		this.files = [];

		this.perms = perms;
	}
	get(name, filters=[PERM_READ,PERM_FORCE_READ]){
		let tfile = null;
		for(const file of this.files){
			//console.log('checking ',file.name, name)
			if(file.name == name){
				tfile = file;
			}
		}
		return tfile;
	}
	copy(dirObj){
		this.files = [ ...this.files, ...dirObj.files ];
	}
	list(filters=[PERM_READ, PERM_FORCE_READ]){
		let cfx = {status:true, opts:{
			type: FS_FOLDER,
			name: this.name,
		}, list:[] };
		if(this.perms.contains([ PERM_READ, PERM_FORCE_READ ])){
			// If dir have indexing permission
			const cfixed_ = this.files.filter( xObj => {
				const perms = xObj.perms;
				return perms.contains(filters, 'or')
			});
			cfx.opts.filters = filters;
			cfx.list = cfixed_;
		}else{
			// If dir don't have indexing permission
			// show force indexed object only
			const xprf = [ PERM_FORCE_READ, PERM_ALL ];
			const cfixed_ = this.files.filter( xObj => {
				const perms = xObj.perms;
				return perms.contains( xprf, 'and');
			});
			cfx.opts.filters = [ ...xprf, ...this.perms ];
			cfx.list = cfixed_;
		}
		return cfx;
	}

	add(xObj){
		const is_valid = this.files.find( pxObj => {
			return (pxObj.name == xObj.name)
		})
		if(!is_valid){
			this.files.push(xObj);
			return {success:true};
		}else{
			return {success:false, reason:'duplicated'};
		}
	}
	adds(xObjs){
		let retx = [];
		for(let i=0;i<xObjs.length;i++){
			const file = xObjs[i];
			retx.push( this.add(file) );
		}
		return retx;
	}
	delete(name, typeObj){
		let t_index;
		const found = this.files.find((x_obj)=>{
			if(x_obj.name == filename && x_obj.fs == typeObj){
				t_index = this.files.indexOf(x_obj);
				return true;
			}
		});
		if(found){
			const deleted_f = this.files.splice(t_index, 1);
			return {success:true,reason:'',opts:{ fs_index: t_index, param1: deleted_f } };
		}else{
			return {success:false,reason:'File not found or already deleted',opts:{} };
		}
	}
}

class AccessGateway{
	constructor(root_dir_obj){
		this.roots = root_dir_obj;
	}
	normalize(ext_path){
		return path.normalize(ext_path);
	}
	get(vpath){
		let rpath = this.normalize(vpath);
		let parsed = path.parse(rpath);
		let cfx = {
			dir: parsed.dir.split(DS).filter(x => (x != '')),
			base: parsed.base,
			ext: parsed.ext,
			name: parsed.name,
		}

		let oObj = this.roots;
		for(const seek of cfx.dir){
			oObj = oObj.get(seek);
			if(oObj == null){
				break;
			}
		}
		let tData = (oObj == null) ? null : oObj.get(cfx.base);
		tData = (typeof tData != 'undefined') ? tData : oObj;
		let uPacked;
		if(tData != null){
			if(tData.fs == FS_FOLDER){
				 uPacked = tData;
			}else if( [FS_LINK, FS_FILE].contains( tData.fs ) ){
				uPacked = tData;
			}else{
				uPacked = {error: 'UNKNOWN', trace:{
				}};
			}
		}
		return (tData == null) ? ({success:false,reason:'file_not_exist_or_priv'}) : ({success:true, data: uPacked});
	}
}

module.exports = {
	Array: Array,

	Link:Link,
	File:File,
	Directory:Directory,
	AccessGateway: AccessGateway,
}


/*
Directory { name: roots
	File { name: babang.txt }
	Directory { name: misc
		Link { name: ini_babang, link_to: ../babang.txt}
	}
}
roots/babang.txt
roots/misc/ini_babang
*/

/*let roots = new Directory('roots');

let file1 = new File('hello.txt','This is testing!');
roots.add(file1);

let new_dir = new Directory('misc');
roots.add(new_dir);

let file1_new_dir = new File('tes.txt', 'This is nested!');
new_dir.add(file1_new_dir);

// Transpose
let ag = new AccessGateway(roots);
let upth = '.';

console.log(ag.get(upth));
*/