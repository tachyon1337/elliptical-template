/*
 * =============================================================
 * elliptical.template
 * =============================================================
 *
 */

//umd pattern

(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        //commonjs
        module.exports = factory(require('elliptical-dustjs'),require('elliptical-scope'),require('elliptical-cache'));
    } else if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define(['elliptical-dustjs','elliptical-scope','elliptical-cache'], factory);
    } else {
        // Browser globals (root is window)
        root.returnExports = factory(root.dust);
    }
}(this, function (dust) {

    window.dust=dust;
    var utils= $.elliptical.utils;
    var _=utils._;
    if(typeof window.dust !== 'undefined'){
        $.widget.$providers({
            template:window.dust
        })
    }

    $.element('elliptical.template', [$.elliptical.scope, $.elliptical.cache],{

        /**
         * init
         * @private
         */
        _initElement:function(){
            this._data.Running=null;
            this._data.unlockInterval=300;
            this._data._intervalId=null;
            this._data.fragment=null;
            this._data.templateId=null;
            this._data.tree=[];
            this._data.pathObservers=[];
            this._data._setDiscardBit=true;
            this._data.modelPathTree=[];
            this._data.previouslyBound=false;
            this._data._watched=false;
            var __customElements=this.options.$customElements;
            this._data.modelNodeSelector=(!__customElements) ? '[data-node="model"]' : 'ui-model';
            this._data.attrId=(!__customElements) ? 'data-id' : 'model-id';
            var template=this.__getTemplateNode();
            if(template[0]){
                this._data.templateNode=template;
                this.__onScriptsLoaded();
            }

        },

        /**
         * watch for the client-side template scripts to be loaded in
         * @private
         */
        __onScriptsLoaded:function(){
            var self=this;
            this._data._intervalId=setInterval(function(){
                if($$.fragments !== undefined){
                    clearInterval(self._data._intervalId);
                    self.__bind();
                }
            },100);
        },


        /**
         * databind if we have a $scope, otherwise call the watcher
         * @param repeat {Boolean}
         * @private
         */
        __bind:function(repeat){
            var template=this._data.templateNode;
            this.__initTemplate(template);
            this.__initDOMObserver(template[0]);
            if(this.__isModelList()){
                (this.__scopeLength() > 0) ? this.__databind(template,repeat) : this.__watch(template,true,repeat);
            }else{
                (!_.isEmpty(this.$scope)) ? this.__databind(template,repeat) : this.__watch(template,false,repeat);
            }
        },

        /**
         *
         * @param template {Object}
         * @param isArray {Boolean}
         * @param repeat {Boolean}
         * @private
         */
        __watch:function(template,isArray,repeat){
            var self=this;
            this._data._watched=true;
            this._data.intervalId=setInterval(function(){
                if((isArray && self.__scopeLength() > 0 ) || (!isArray && !_.isEmpty(self.$scope))){
                    self._data._watched=false;
                    clearInterval(self._data.intervalId);
                    self.__databind(template,repeat);
                }
            },100);
        },

        /**
         *
         * @private
         */
        __getTemplateNode:function(){
            return this.element.find('ui-template');
        },

        /**
         * gets and parses the element template fragment
         * @param template {Object}
         * @private
         */
        __initTemplate:function(template){
            var fragment;
            var id=template.attr('id');
            var name=template.attr('name');
            if(typeof id !=='undefined'){
                this._data.templateId=id;
                fragment=this.__getFragmentById(id);
                this._data.fragment=fragment;
                if(fragment){
                    this.__parseTemplateFragment(fragment);
                }

            }else if(typeof name !=='undefined'){

            }
        },


        /**
         * init template fragment mutation observer for template DOM additions/removal
         * @param template {Object} Node Element
         * @private
         */
        __initDOMObserver:function(template){
            var self=this;
            var observer=new MutationObserver(function(mutations){
                mutations.forEach(function(mutation){
                    if(mutation.addedNodes && mutation.addedNodes.length>0){ //nodes added
                        self.__addedNodes(mutation.addedNodes);

                    }
                    if(mutation.removedNodes && mutation.removedNodes.length>0){ //nodes removed

                        self.__removedNodes(mutation.removedNodes);
                    }

                    /* fire the hook for the mutation record */
                    self._onDOMMutation(mutation);
                });

            });
            observer.observe(template, {childList: true,subtree:true});
            this._data.DOMObserver=observer;
        },

        /**
         * fetches the uncompiled string template fragment for the passed id
         * @param id {String}
         * @returns {String}
         * @private
         */
        __getFragmentById:function(id){
            var fragment;
            if (!$$.fragments.length > 0){
                return null;
            }
            $$.fragments.forEach(function(obj){
                if(obj.id===id){
                    fragment=obj.fragment;
                }
            });

            return fragment;
        },

        /**
         * parses a fragment into a contextKeyArray
         * a dom fragment is passed to dust.parse, which returns an array
         * the array is then further parsed into a contextKeyArray
         * contextKeyArray = array of cxt objects
         *
         * NOTE: context==section in the dustjs parlance
         *
         * cxt={
             *    index: {number} the context depth index
             *    context: {string} the context/section at the index
             *    cxt: {array} string of contexts(context/section tree) for each index up to current index
             *    key: {string} model prop/key
             * }
         *
         * the last object will be the array of context/section trees
         *
         * example: users=[
         *   {
             *    name:'Bob Smith'
             *    addresses:[{address:'1234 East Ave'},{address:'1673 Main St'}]
             *   },
         *   {
             *    name:'Jane Doe'
             *    addresses:[{address:'4321 West Ave'},{address:'9090 XYZ Ave'}]
             *   }
         * ]
         *
         * contextKeyArray=[
             *   {
             *     context:'users',
             *     cxt:['users'],
             *     index:0
             *   },
             *   {
             *     context:'users',
             *     cxt:['users'],
             *     index:0,
             *     key:'name'
             *   },
             *   {
             *     context:'addresses',
             *     cxt:['users','addresses'],
             *     index:1
             *   },
             *   {
             *     context:'addresses',
             *     cxt:['users','addresses'],
             *     index:1,
             *     key:'address'
             *   },
             *   {
             *     [
             *       {
             *        context:'users',
             *        cxt:['users'],
             *        index:0
             *       },
             *       {
             *        context:'addresses',
             *        cxt:['users','addresses'],
             *        index:1
             *       }
             *
             *
             *     ]
             *   }
         * ]
         * @param fragment {Object}
         * @private
         */
        __parseTemplateFragment:function(fragment){
            var provider=this.options.$providers.template;
            var parsed=provider.parse(fragment);
            var contextArray=[];
            var contextKeyArray=[];
            var index=0;
            var context;

            if(parsed.length && parsed.length >0){
                tree(parsed);
            }


            /**
             * recursively parses dust array to build our custom contextKeyArray to enable
             * matching node elements with a javascript model without having to resort to excessive data-path-annotations
             * @param arr {Array}
             */
            function tree(arr){
                if(arr && arr.length){
                    arr.forEach(function(obj){
                        if(obj[0]==='#' && _.isArray(obj)){
                            var obj_={
                                index:index,
                                context:obj[1][1],
                                cxt:getCxt(obj[1][1],index,false)
                            };
                            context=obj[1][1];
                            contextKeyArray.push(obj_);
                            contextArray.push(obj_);
                            var indexRef=index;
                            index++;
                            tree(obj);
                            index=indexRef;

                        }else if(obj[0]==='bodies'){
                            tree(obj[1]);
                        }else if(obj[0]==='reference'){
                            tree(obj[1]);
                        }else if(obj[0]==='body'){

                            obj.forEach(function(o){
                                if(o[0]==='reference'){
                                    var obj_={
                                        cxt:getCxt(context,index),
                                        context:context,
                                        index:index,
                                        key:o[1][1]
                                    };
                                    contextKeyArray.push(obj_);
                                }
                            });
                            tree(obj);
                        }
                    });
                }
            }

            /**
             * builds a context/section tree array for a passed context and context index(depth)
             * @param context {String}
             * @param index {Number}
             * @param dec {Boolean}
             * @returns {Array}
             */
            function getCxt(context,index,dec){
                if(typeof dec==='undefined'){
                    dec=true;
                }

                if(index > 0 && dec){
                    index--;
                }
                var arr=[];
                contextArray.forEach(function(obj){
                    if(obj.index < index){
                        arr.push(obj.context);
                    }
                });
                if(context){
                    arr.push(context);
                }

                return arr;
            }

            contextKeyArray.push(contextArray);
            this._data.contextKeyArray=contextKeyArray;

        },

        /**
         * returns template fragment model children (ui-model) nodes(jQuery objects)
         * @private
         * @returns {Array}
         */
        __templateModels: function(template){
            if(typeof template==='undefined'){
                template=this._data.templateNode;
            }
            var modelNode=this._data.modelNodeSelector;
            return (template) ? template.find(modelNode) : null;

        },

        _templateNodes:function(){
            return this.__templateModels();
        },

        _nodeById:function(id){
            var nodes=this._templateNodes();
            return nodes.selfFind('[model-id="' + id + '"]');
        },


        /**
         * bind path observers to DOM
         * @param template {Object}
         * @param repeat {Boolean}
         * @param redraw {Boolean}
         * @private
         */
        __databind:function(template,repeat,redraw){
            /* lock observer callbacks while data binding */
           this.__lock();

            var self=this;
            var $scope=this.$scope;

            var models=this.__templateModels(template);

            //two-way databind only: if the model is an array and model is already rendered
            if(this.__isModelList() && models && models.length > 0 && redraw===undefined) {
                $.each(models, function (i, model) {
                    self.__bindModel(model, i);
                });
            }else if(!_.isEmpty($scope) && repeat===undefined){
                //if we need to first render the model and then two-way databind
                this.__render($scope,function(){
                    self.__databind(template,false,undefined);
                });

            }else{
                //model is an object
                this.__bindModel(template[0],null);
            }
            /* mark DOM as bound(i.e., text Nodes have been created for keys) */
            this._data.previouslyBound=true;

            /* unlock observer callbacks */
            this.__unlock();

        },

        /**
         * renders the template fragment directly using the $scope
         * @param $scope {Object}
         * @param callback {Function}
         * @private
         */
        __render: function($scope,callback){
            var opts={};
            opts.template=this._data.templateId;
            if(this.__isModelList()){
                var prop=Object.keys($scope)[0];
                opts.model=$scope[prop];
                opts.context=prop;
            }else{
                opts.model=$scope;
            }
            opts.parse=false;
            this.__renderTemplate(opts,callback);
        },

        /**
         *
         * @param opts {Object}
         * @param callback {Function}
         * @private
         */
        __renderTemplate:function(opts,callback){
            var self=this;
            this._renderTemplate(opts,function(err,out){
                var html=out.replace(/<ui-template(.*?)>/g,'').replace(/<\/ui-template>/g,'');
                self._data.templateNode.html(html);
                if(callback){
                    callback(err,out);
                }
            });
        },

        /**
         * lock observer callbacks(scope and mutation)
         * @private
         */
        __lock:function(){
            this._data.Running=true;
            if(this._data._setDiscardBit){
                this._data._discard=true;
            }


        },

        /**
         * unlocks observer callbacks
         * if the mutation or scope observer callback is triggered during data binding, infinite
         * looping can result. so block this with flag settings
         * @private
         */
        __unlock:function(){
            var self=this;
            var unlockInterval=this._data.unlockInterval;
            setTimeout(function(){
                self._data.Running=null;
                self._data._discard=false;
                self._data._setDiscardBit=true;

            },unlockInterval);
        },

        /**
         * two-way binds a model to the template DOM fragment
         * @param fragment
         * @param index
         * @private
         */
        __bindModel:function(fragment,index){
            var self=this;
            var $scope=this.$scope;
            var contextIndex=0;
            var modelPathTree=[];
            var pathObservers=this._data.pathObservers;
            var templateNode=this._data.templateNode;
            if(!index && this.options.scope){
                setModelPath(0,this.options.scope,null);
            }
            /**
             *  pushes an object representing the resolved model path for the currently traversed node
             *  to the modelPathTree array
             *
             *  modelPathTree=array of {index:<number>,context:<string>,cxt:<array>,modelIndex:<number}}
             *  a modelPathTree and a key, for example, gives you a resolvable path for a node that can be passed to a pathObserver
             *
             *  the modelPathTree array records the resolved model path for each context/section in the current node tree hierarchy
             * @param cxtIndex {number} context/section depth
             * @param context {string} context/section name
             * @param modelIndex {number} model depth
             */
            function setModelPath(cxtIndex,context,modelIndex){
                var path_=self.__getTemplateContextArray();
                if(path_ && path_.length > 0){
                    path_.forEach(function(obj){
                        if(obj.index===cxtIndex && obj.context===context){
                            var cxt={
                                index:cxtIndex,
                                context:obj.context,
                                cxt:obj.cxt,
                                modelIndex:modelIndex
                            };
                            modelPathTree.push(cxt);

                        }
                    });
                }
            }

            /**
             * returns the last element of the modelPathTree array
             * @returns {Object}
             */
            function getLastRecordedModelPath(){
                return (modelPathTree.length > 0) ? modelPathTree[modelPathTree.length -1] : null;

            }

            /**
             * get context array by depth
             * @param cxtIndex{number}
             * @returns {Array}
             */
            function getModelContextByDepth(cxtIndex){
                var arr=[];
                var path_=self.__getTemplateContextArray();
                if(path_ && path_.length > 0){
                    path_.forEach(function(obj){
                        if(obj.index===cxtIndex){
                            arr.push(obj);
                        }
                    });
                }

                return arr;
            }

            /**
             * returns the context depth of a ui-model node relative to parent ui-template node
             * @param node {object} HTMLElement
             * @returns {number}
             */
            function modelDepth(node) {
                var depth = 0;
                var templateNode_ = templateNode[0];
                //simply get the parent of the current node until we reach the ui-template node.
                //test each parent for model node tag or attribute
                while (!(node===templateNode_)) {
                    node = $(node).parent()[0];
                    if(node.tagName==='UI-MODEL' || node.hasAttribute('data-node')){
                        depth++;
                    }
                }
                return depth;

            }


            /**
             * delete branches from tree that have index greater than the passed context index
             * @param cxtIndex
             */
            function popModelPathTree(cxtIndex){
                if(modelPathTree.length > 0){
                    _.remove(modelPathTree,function(obj){
                        return (obj.index > cxtIndex);
                    })
                }
            }
            function clearModelPathTree(){
                modelPathTree.length=0;
            }


            /**
             * sets the modelPathTree for the traversed node and passes any nodes with attributes to the parseNodeAttributes function
             * @param node {Object}
             * @private
             */
            function parseNode(node){

                //if <ui-model> node only
                if((node.tagName && node.tagName.toLowerCase()==='ui-model') ||(node.hasAttribute && node.hasAttribute('data-node'))){

                    /* resolve the model path for any <ui-model> node and insert into the modelPathTree.
                     The modelPathTree, along with any given node's data attributes(data-key=,data-attribute=),
                     is sufficient to set a pathObserver for a the given node within the node hierarchy
                     */

                    /* current context depth */
                    contextIndex=modelDepth(node);

                    var lastRecordedContext=getLastRecordedModelPath();
                    //if current depth less than last recorded depth, pop modelPathTree back to current depth
                    if(lastRecordedContext && lastRecordedContext.index > contextIndex){
                        popModelPathTree(contextIndex);
                    }


                    /* current model index.
                     NOTE: model index==applicable $scope index. it has no relation to any persistent backend index */
                    var parent=(contextIndex===0) ? self._data.templateNode[0] : $(node).parents(self._data.modelNodeSelector)[0];
                    /*  if there is only a single context at the tree depth, model index = <ui-model> DOM child index

                     Pagination NOTE: it is assumed pagination loads in a new scope with a different paginated view; two-way data-binding
                     will not work for $scope pagination, the nodes will not be synced with the $scope
                     */
                    if(parent===undefined){
                        parent=self._data.templateNode[0];
                    }

                    var modelIndex=$(parent).closestChildren(self._data.modelNodeSelector).index($(node));

                    //check if more than one context for this tree depth
                    var contextArr_=getModelContextByDepth(contextIndex);
                    var cxt_={};

                    if(contextArr_ && contextArr_.length > 1){
                        //multiple contexts at this tree depth

                        /* we have to correct model index, since it is calculated by simple children index in the DOM
                         for multiple contexts at the same depth, the model index is no longer synced with the DOM index
                         __getCurrentContextModelPath returns the correct model index for the context based on the DOM child index
                         and the $scope
                         */
                        cxt_=self.__getCurrentContextModelPath(modelPathTree,contextIndex,contextArr_,modelIndex);

                        if(lastRecordedContext && contextIndex > lastRecordedContext.index){
                            popModelPathTree(contextIndex);
                            setModelPath(contextIndex,cxt_.context,cxt_.modelIndex);

                        }else{
                            modelPathTree.pop();
                            setModelPath(contextIndex,cxt_.context,cxt_.modelIndex);
                        }

                        /* if current context tree depth greater than last recorded, just set the model path */
                    }else if(lastRecordedContext && contextIndex > lastRecordedContext.index) {
                        setModelPath(contextIndex, contextArr_[0].context, modelIndex);
                        //if last record but same depth as last record, pop and set:this refreshes model index
                    }else if(lastRecordedContext){
                        modelPathTree.pop();
                        setModelPath(contextIndex,contextArr_[0].context,modelIndex);
                        //if no last record, simply set
                    }else if(!lastRecordedContext && contextArr_.length > 0){
                        setModelPath(contextIndex,contextArr_[0].context,modelIndex);
                    }
                }else{

                    /* get reference to parent ui-model node */
                    var parent = $(node).parents(self._data.modelNodeSelector)[0];
                    /* get context index */
                    if(parent){
                        contextIndex=modelDepth(parent);

                    }else{
                        contextIndex=0;
                        clearModelPathTree();
                    }
                    var lastRecordedContext=getLastRecordedModelPath();
                    //if current depth less than last recorded depth, pop modelPathTree
                    if(lastRecordedContext && lastRecordedContext.index > contextIndex){
                        popModelPathTree(contextIndex);
                    }

                }

                //for non-textNodes with attributes
                if(node.nodeType !==3 && node.hasAttributes() || (node.tagName && node.tagName.toLowerCase()==='ui-model')){
                    parseNodeAttributes(node);
                }

            }

            /**
             * parses a node attributes to send for text binding or attribute binding
             * @param node {Object}
             * @private
             */
            function parseNodeAttributes(node){
                var id=self._data.scopeId;
                if(id===undefined){
                    id='id';
                }
                var key,keys,attr;

                $.each(node.attributes,function(i,attribute){
                    try{
                        if(attribute && attribute!==undefined){
                            if(attribute.name.indexOf('model')===0){
                                key=id;
                                attr=attribute.name;
                                var tuple_=[attr,key];
                                bindAttributeObserver(node,tuple_,attribute.value);
                            }else if(attribute.name.indexOf('data-bind')===0){
                                var values=attribute.value.split(',');

                                if(values.length){
                                    values.forEach(function(val){
                                        val=val.trim();
                                        var ntuple=val.split(':');
                                        var bindingType=ntuple[0];
                                        (bindingType==='text') ? bindTextNodeObserver(node,ntuple) : bindAttributeObserver(node,ntuple);
                                    });
                                }
                            }
                        }

                    }catch(ex){
                        console.log(ex);
                    }

                });


                //set index path for ui-model nodes
                if(node.tagName && node.tagName.toLowerCase()==='ui-model'){
                    setData(node);
                }


                /**
                 *bind an attribute name/value pair
                 * @param val {String} colon separated string(name:value)
                 * @private
                 */
                /*function _bindAttributeObserver(val){
                    var arr=val.split(':');
                    if(arr.length){
                        var attr=arr[0].trim();
                        var key=arr[1].trim();
                        bindAttributeObserver(node,attr,key);
                    }
                }*/

            }

            /**
             * creates a textNode and path observer for a bindable model property
             * @param node {Object}
             * @param tuple {Array}
             */
            function bindTextNodeObserver(node,tuple){
                //var values_=tuple.split(':');
                var key=tuple[1];
                var fn={};
                if(tuple.length > 2){
                    fn=parseFunction(tuple[2]);
                }
                var $cache=self._data.$cache;
                var previouslyBound=self._data.previouslyBound;
                var path = self.__createPath(modelPathTree, key);
                var value = utils.objectPropertyByPath($scope, path);
                /* if the tuple has a function attached, evaluate the value from the function */
                if(!_.isEmpty(fn)){
                    value=eval_(value,fn);
                    //update the path value of scope
                    utils.assignValueToPath($scope,path,value);
                }
                var $node=$(node);
                var text,$text;
                /* if fragment has been previously bound, we select textNode, otherwise create it */
                if(previouslyBound){
                    var $textNodes=$node.findTextNodes();
                    $.each($textNodes,function(i,t){
                        if(t.textContent===value){
                            $text=$(t);
                        }
                    });
                    text=($text && $text[0]) ? $text[0] : self.__createTextNode($node,node,value);
                }else{
                    /* create and append */
                    text=self.__createTextNode($node,node,value);
                }
                $cache.set(text,{observers:path});
                var obsPath=utils.observerMapPath(path);
                var observer = new PathObserver($scope, utils.observerMapPath(path));
                text.bind('textContent', observer);
                var observer_ = {
                    type: 'text',
                    value:'textContent',
                    node: text,
                    path:path,
                    observer: observer

                };

                pathObservers.push(observer_);

            }

            /**
             * bind path observers to attributes
             * @param node {Object}
             * @param tuple {Array}
             * @param mId {String}
             */
            function bindAttributeObserver(node,tuple,mId){
                var attribute=tuple[0];
                var key=tuple[1];
                var fn={};
                if(tuple.length > 2){
                    fn=parseFunction(tuple[2]);
                }
                var $cache=self._data.$cache;
                var observers_,id_;
                var path = self.__createPath(modelPathTree, key);
                var value = utils.objectPropertyByPath($scope, path);

                /* if the tuple has a function attached, evaluate the value from the function */
                if(!_.isEmpty(fn)){
                    value=eval_(value,fn);
                    //update the path value of scope
                    utils.assignValueToPath($scope,path,value);
                }
                var data=$cache.get(node);
                if(data){
                    observers_=data.observers;
                    id_=data.id;
                }else{
                    id_=mId;
                }
                if(observers_ && observers_.length > 0){
                    var obj_=null;
                    observers_.forEach(function(o){
                        if(o.value===attribute){
                            o.path=path;
                            o.value_=value;
                            obj_=o;
                        }
                    });
                    if(!obj_){
                        obj_={
                            value:attribute,
                            value_:value,
                            path:path
                        };
                        observers_.push(obj_);
                    }
                }else{
                    observers_=[];
                    obj_={
                        value:attribute,
                        value_:value,
                        path:path
                    };
                    observers_.push(obj_);
                    $cache.set(node,{observers:observers_,id:id_});
                }
                var obsPath=utils.observerMapPath(path);
                var observer = new PathObserver($scope, utils.observerMapPath(path));
                node.bind(attribute, observer);
                var observer_ = {
                    type: 'attribute',
                    value:attribute,
                    node: node,
                    path:path,
                    observer: observer

                };

                pathObservers.push(observer_);


            }

            /* parse a stringified function into method name + arg list */
            function parseFunction(sFunc){
                var argList;
                var args=sFunc.match(/\((.*?)\)/g);
                if(!args){
                    args='';
                }
                var func=sFunc.replace(args,'');
                args=args.replace('(','');
                args=args.replace(')','');
                if(args.length < 1){
                    argList=[]
                }else{
                    argList=args.split(',');
                }

                return{
                    func:func,
                    args:argList
                }
            }

            /* evaluates a template value from a passed function */
            function eval_(value,fn){
                var func=fn.func;
                var f,args;
                if(window.dust.helpers.inline[func]){//dust.helpers.inline
                    f=window.dust.helpers.inline[func];
                    args=fn.args;
                    (args.length >0) ? args.unshift(value) : args.push(value);
                    return f.apply(this,args);
                }else if(window[func]){//window
                    f=window[func];
                    args=fn.args;
                    (args.length >0) ? args.unshift(value) : args.push(value);
                    return f.apply(this,args);
                }else if(this[func]){ //controller instance prototype
                    f=this[func];
                    args=fn.args;
                    (args.length >0) ? args.unshift(value) : args.push(value);
                    return f.apply(this,args);
                }else{
                    return value;
                }

            }

            /**
             *  set the index path data for ui-model nodes
             * @param node {Object}
             */
            function setData(node){
                var $cache=self._data.$cache;
                var data=$cache.get(node);
                var observers,id;
                if(data){
                    observers=data.observers;
                    id=data.id;
                }
                var path = self.__createPath(modelPathTree);
                try{
                    index=utils.getIndexFromPath(path);
                }catch(ex){

                }

                $cache.set(node,{path:path,id:id,index:index,observers:observers});

            }


            /* walk the dom fragment with parseNode as the function */
            this.__traverseDOM(fragment,parseNode);

        },

        /**
         * standard walk-the-dom recursion
         * @param node {Element}
         * @param func {Function}
         * @private
         */
        __traverseDOM:function(node,func){
            func(node);
            node = node.firstChild;
            while (node) {
                this.__traverseDOM(node, func);
                node = node.nextSibling;
            }
        },

        /** //TODO: enable multiple keys mappings to text nodes within an element: ex: <h2 data-key="firstName,lastName">Hello, {firstName} {lastName}</h2>
         *  //currently, to have correctly functioning two-way binding, you would have to do something like:
         *  //<h2>Hello, <span data-key="firstName">{firstName}</span> <span data-key="lastName">{lastName}</span></h2>
         *  //not a show-stopper, but it is a bit of an inconvenience
         *
         * create text node
         * @param $node {Object} jQuery
         * @param node {Object} Element
         * @param value {String}
         * @returns {Text} {Object} jQuery
         * @private
         */
        __createTextNode: function($node,node,value){
            $node.text($node.text().replace(value, ''));
            var text = document.createTextNode(value);
            node.appendChild(text);

            return text;

        },

        /**
         * returns the context tree array from the contextKeyArray(i.e., returns the last item in the contextKeyArray)
         * @returns {Array}
         * @private
         */
        __getTemplateContextArray:function(){
            var contextKeyArray=this._data.contextKeyArray;
            return (contextKeyArray && contextKeyArray.length > 0) ? contextKeyArray[contextKeyArray.length -1] : [];

        },

        /**
         * returns a resolved path based on the passed modelPathTree and key
         * @param modelPathTree {Array}
         * @param key {String}
         * @returns {string} path
         * @private
         */
        __createPath: function(modelPathTree,key){
            var path='';
            modelPathTree.forEach(function(obj){
                if(typeof obj.modelIndex !== 'undefined'){
                    path += obj.context + '.' + obj.modelIndex + '.';
                }else{
                    path += obj.context + '.'
                }

            });

            (typeof key !=='undefined') ? path+=key : path=path.substring(0, path.length - 1);
            return path;

        },

        /**
         * returns a resolved context path based on the passed modelPathTree context index, and context
         * @param modelPathTree {Array}
         * @param cxtIndex {Number}
         * @param context {String}
         * @returns {String} path
         * @private
         */
        __createPathByContextIndex: function(modelPathTree,cxtIndex,context){
            var path='';
            modelPathTree.forEach(function(obj){
                if(obj.index <= cxtIndex){
                    path += obj.context + '.' + obj.modelIndex + '.';
                }

            });
            path += context;

            return path;
        },


        /**
         * @param modelPathTree {Array}
         * @param cxtIndex {Number}
         * @param contextArray {Array}
         * @param index {Number}
         * @returns {*}
         * @private
         */
        __getCurrentContextModelPath: function(modelPathTree,cxtIndex,contextArray,index){
            var self=this;
            var $scope=this.$scope;
            /*we need to calculate context/array lengths for contexts with equal hierarchy. The model index of the current
             node will then allow us to determine which context we are currently in.

             Hence, we need the resolved path for the context index==cIdx == (cxtIndex >0)? (cxtIndex-1) : 0;

             */

            var cIdx=(cxtIndex>0) ? cxtIndex-1 : 0;
            var pathArray=[];
            contextArray.forEach(function(obj){
                var path=self.__createPathByContextIndex(modelPathTree,cIdx,obj.context);
                var length=utils.arrayPropertyLengthByPath($scope,path);
                pathArray.push({length:length,context:obj.context,cxt:obj.cxt});
            });


            if(pathArray.length > 1){
                var obj_={};
                var cumlativeLength=0;

                for(var i=0;i<pathArray.length;i++){
                    if((index < pathArray[i].length + cumlativeLength)|| (!pathArray[i].length)){
                        obj_.modelIndex=index-cumlativeLength;
                        obj_.context=pathArray[i].context;
                        obj_.cxt=pathArray[i].cxt;
                        obj_.index=cxtIndex;
                        break;
                    }else{
                        cumlativeLength +=pathArray[i].length;
                    }
                }
                return obj_;
            }else{
                return {
                    modelIndex:index,
                    context:contextArray[0].context,
                    cxt:contextArray[0].cxt,
                    index:contextArray[0].index
                };
            }
        },

        /**
         * get parent model('ui-model') node of a node
         * @param node {Object}
         * @returns {Object}
         * @private
         */
        __getParentModelNode:function(node){
            var parent=$(node).parents(this._data.modelNodeSelector);
            if(parent[0]){
                return parent[0];
            }else{
                return this._data.templateNode[0];
            }
        },

        /**
         * onAddedNodes
         * @param added {Array}
         * @private
         */
        __addedNodes:function(added){
            if(this._data.Running){
                return;
            }
            if(this.__isModelList()){
                this.__rebind();
            }

        },

        /**
         * mutation handler for removed nodes.
         * deletes paths from the scope and rebinds path observers
         * @param removed{Array}
         * @private
         */
        __removedNodes:function(removed){
            /* exit if triggered during data-binding */
            if(this._data.Running){
                return;
            }
            var $scope=this.$scope;
            var self=this;
            var rebind_;
            var boolRebind=false;
            for(var i=0;i<removed.length;i++){
                var $cache=this._data.$cache;
                var node=removed[i];
                var observers=$cache.get(node);
                if(observers){
                    rebind_=this.__parseObservers(node,$scope);
                    if(rebind_){
                        boolRebind=true;
                    }
                }else{
                    var children=$(removed).findTextNodeDescendants();
                    if(children && children.length > 0){
                        $.each(children,function(i,obj){
                            rebind_=self.__parseObservers(obj,$scope);
                            if(rebind_){
                                boolRebind=true;
                            }
                        });
                    }
                }
            }

            if(boolRebind){
                this.__rebind();
            }

            this._onRemovedNodes(removed);
        },

        /**
         * performs a $scope splice or delete based on node path
         * @param node {Object}
         * @param $scope {Object}
         * @private
         */
        __parseObservers:function(node,$scope){
            var $cache=this._data.$cache;
            var observers=$cache.get(node);
            if(typeof observers !=='undefined'){
                var path=observers.path;
                /* determine if path if part of an array or object
                 if object, delete property
                 if array, splice
                 */
                //
                var isArray=utils.isPathInArray(path);
                (isArray) ? this.__spliceArray($scope,path) : utils.deleteObjectPropertyByPath($scope,path);
                return true;
            }else{
                return false;
            }
        },

        /**
         * splice an array $scope property
         * @param $scope {Object}
         * @param path {String}
         * @private
         */
        __spliceArray:function($scope,path){
            var index=utils.getIndexFromPath(path);
            if(index !== undefined){
                path=this.__parsePath(path,index);
                var arr=utils.objectPropertyByPath($scope,path);
                this._data._discard=false;
                this._data._setDiscardBit=false;
                arr.splice(index,1);


            }
        },

        /**
         * returns a path substring for the array property, removing the index of the array element
         * @param path {String}
         * @param index {Number}
         * @returns {string}
         * @private
         */
        __parsePath:function(path,index){
            return path.substring(0, path.length - (index.toString().length + 1));

        },


        /**
         * rebinds the pathObservers, called after a model removal or addition
         * @private
         */
        __rebind: function(){
            var template=this._data.templateNode;
            this.__unbindPathObservers();
            this.__databind(template);
        },


        /**
         * $scope change callback handler mediator
         * @param result {Object}
         * @private
         */
        __onScopeChange: function(result){
            if(result.removed && result.removed.length && result.removed.length > 0) {
                this.__onRemoved(result.removed)
            }

            this._onScopeChange(result);
        },


        /**
         * removes a ui-model node from the template by path
         * @param path {String}
         * @private
         */
        __onListRemove: function(path){

            var self=this;
            var fragment=this._data.templateNode[0];
            var $cache=this._data.$cache;

            function removeNode(node){
                if((node.tagName && node.tagName.toLowerCase()==='ui-model') ||(node.hasAttribute && node.hasAttribute('data-node'))){
                    var observers=$cache.get(node);
                    var index=observers.index;
                    if(index===path){
                        node.remove();
                        self._data.previouslyBound=true;
                        self.__rebind();
                    }
                }
            }

            /* walk the dom fragment with removeNode as the function */
            this.__traverseDOM(fragment,removeNode);

        },

        /**
         * adds a ui-model node to the template as the result of an array operation
         * @param path {String} the path reference to the array within the $scope
         * @param section {String} the section name
         * @param op {String} operation: push or unshift
         * @private
         */
        __onListAdd: function(path,section,op){

            var self=this;

            /* get template */
            var templateName=this._compileFragment(path,section);

            /* get parent model node of the array */
            var parent=this.__getParent(path,section);

            /* get insertion index */
            var insertionIndex=(op==='push' || op==='concat') ? this.__getPushInsertionIndex(path,section) : this.__getUnshiftInsertionIndex(path,section);

            /* get model */
            var model=this.__getModelFromPath(path,op);

            /* render */
            var opts={};
            opts.template=templateName;
            opts.model=model;
            opts.context=section;
            opts.parse=false;
            this._renderTemplate(opts,function(err,out){
                if(!err){
                    self.__insertRenderedTemplate(out,parent,insertionIndex);
                }
            });

        },

        /**
         * compile a fragment of an existing template into provider cache, by path and section
         * @param path {string]
         * @param section {string}
         * @returns {string}
         * @private
         */
        _compileFragment:function(path,section){
            //todo verify fragment has not previously been compiled
            var provider=this.options.$providers.template;
            var id=this._data.templateId;
            var templateName = id + '-' + section;
            var fragment=this.__getFragmentById(id);
            var match='{#' + section + '}.(.*?){\/' + section + '}';
            var partial=fragment.match(new RegExp(match,'g'));
            /* if number of matches > 1, assign correct partial */
            var partial_=(partial.length > 1) ? this.__getPartial(partial,path,section) : partial[0];
            var compiled=provider.compile(partial_,templateName);
            provider.loadSource(compiled);
            return templateName;
        },

        /**
         * get the model from the array path based on operation(push==last element, unshift=first element)
         * @param path {String}
         * @param operation {String}
         * @returns {Object}
         * @private
         */
        __getModelFromPath:function(path,operation){
            var $scope=this.$scope;
            var arr=utils.objectPropertyByPath($scope,path);
            //return (operation==='push') ? arr[arr.length-1] : arr[0];
            var ret;
            if(operation==='push'){
                return arr[arr.length-1];
            }else if(operation==='unshift'){
                return arr[0];
            }else{
                return arr;
            }
        },

        /**
         * returns the correct ui-model template fragment for section depths that have more than one context
         * @param partial {Array}
         * @param path {String}
         * @param section {String}
         * @returns {String} ui-model template fragment
         * @private
         */
        __getPartial:function(partial,path,section){
            var match = section + '.';
            var matches=path.match(new RegExp(match,'g'));
            var length=matches.length;
            return partial[length-1];
        },

        /**
         * gets the parent ui-model node
         * @param path {String}
         * @returns {Object} node
         * @private
         */
        __getParent:function(path){
            var paths=path.split('.');
            if (paths.length < 2){
                return this._data.templateNode[0];
            }else{
                var path_=this.__getParentPath(paths);
                return this.__getParentByPath(path_);
            }
        },

        /**
         * gets the parent model node path
         * @param arr {Array}
         * @returns {string}
         * @private
         */
        __getParentPath:function(arr){
            var length=arr.length-1;
            var path='';
            for(var i=0;i<length;i++){
                path+=arr[i] + '.';
            }
            return path.substring(0,path.length-1);
        },

        /**
         * runs the walk the dom routine to find the ui-model parent node(finds it by the set index path in the dom cache store)
         * @param path {String}
         * @returns {*}
         * @private
         */
        __getParentByPath:function(path){
            var fragment=this._data.templateNode[0];
            var $cache=this._data.$cache;
            var node_;
            function getNode(node){
                if((node.tagName && node.tagName.toLowerCase()==='ui-model') ||(node.hasAttribute && node.hasAttribute('data-node'))){
                    var observers=$cache.get(node);
                    var path_=observers.path;
                    if(path_===path){
                        node_=node;
                    }
                }
            }

            this.__traverseDOM(fragment,getNode);

            return node_;
        },

        /**
         *
         * for push: gets the insertion index to insert ui-model node into ui-model children
         * @param path {String}
         * @param section {String}
         * @returns {number}
         * @private
         */
        __getPushInsertionIndex:function(path,section){
            var $scope=this.$scope;
            var arr=this.__getContextArrayFromPath(path);
            var sectionContextProp=this.__getSectionContextProp(arr,section);
            if(sectionContextProp.count===1){
                return -1;
            }else{
                if(sectionContextProp.position===sectionContextProp.count -1){
                    return -1;
                }else{
                    var paths=path.split('.');
                    var parentPath=this.__getParentPath(paths);
                    var index=0;
                    for(var i=0;i<sectionContextProp.position + 1;i++){
                        var path_=(parentPath.length && parentPath.length > 0) ? parentPath + '.' + sectionContextProp.cxt[i] : sectionContextProp.cxt[i];
                        var length = utils.arrayPropertyLengthByPath($scope,path_);
                        index=index + length;
                    }
                    return index;
                }
            }
        },

        /**
         * for unshift: gets insertion index to insert ui-model node into a parent section's ui-model children
         * @param path {String}
         * @param section {String}
         * @returns {number}
         * @private
         */
        __getUnshiftInsertionIndex:function(path,section){
            var $scope=this.$scope;
            var arr=this.__getContextArrayFromPath(path);
            var sectionContextProp=this.__getSectionContextProp(arr,section);
            if(sectionContextProp.count===1){
                return 0;
            }else{

                var paths=path.split('.');
                var parentPath=this.__getParentPath(paths);
                var index=0;
                for(var i=0;i<sectionContextProp.position;i++){
                    var path_=parentPath + '.' + sectionContextProp.cxt[i];
                    var length = utils.arrayPropertyLengthByPath($scope,path_);
                    index=index + length;
                }
                return index;

            }
        },

        /**
         * returns a prop object for a template section, given a child context within that section
         * count: number of child contexts
         * position: position of our section in the list
         * cxt: array of the one-level down child contexts
         * @param arr {Array}
         * @param section {String}
         * @returns {Object}
         * @private
         */
        __getSectionContextProp:function(arr,section){
            var prop={};
            prop.count=arr.length;
            prop.cxt=arr;
            prop.position= _.indexOf(arr,section);

            return prop;

        },



        __getParentIndex:function(path){
            var paths=path.split('.');
            return path[0] + '.' + paths[1];
        },

        /**
         * returns the array of context blocks for a path
         * @param path {String}
         * @returns {Array}
         * @private
         */
        __getContextArrayFromPath:function(path){
            var self=this;
            var arr=[];
            var paths=path.split('.');
            paths.forEach(function(s){
                if(!self.__isNumeric(s)){
                    arr.push(s);
                }
            });

            var depth=arr.length-1;
            var contextArray=this.__getTemplateContextArray();
            var cxtArray=[];
            contextArray.forEach(function(obj){
                if(obj.index===depth){
                    cxtArray.push(obj.context);
                }
            });

            return cxtArray;

        },


        /**
         * numeric check for a string
         * @param p
         * @returns {boolean}
         * @private
         */
        __isNumeric:function(p){
            var p_ = parseInt(p);
            return !(isNaN(p_));
        },

        /**
         * inserts rendering into the template DOM fragment, discarding text nodes
         * @param out {Array}
         * @param parent {Object}
         * @param index {Number}
         * @private
         */
        __insertRenderedTemplate:function(out,parent,index){
            var fragment,$fragment;
            var $parent=$(parent);
            var models=$parent.closestChildren(this._data.modelNodeSelector);
            $fragment=this._fragmentModelParser(out);
            fragment=$fragment[0];
            var model;
            if(index===-1){
                $parent.append($fragment);
            }else if(index===0){
                model=models[0];
                parent.insertBefore(fragment, model);
            }else{
                model=models[index];
                parent.insertBefore(fragment, model);
            }

            this.__rebind();

        },

        _fragmentModelParser:function(fragment){
            var doc = this._DOMParser(fragment);
            return $(doc).find('ui-model');
        },


        /**
         * removes
         * @param removed
         * @private
         */
        __onRemoved:function(removed){
            var self=this;
            var rebind=false;
            var $cache=self._data.$cache;
            var id=this.options.idProp;
            if(id===undefined){
                id='id';
            }
            if(this.__isModelList()){
                removed.forEach(function(obj){
                    var models=self.__templateModels();
                    if(models && models.length > 0){
                        $.each(models,function(i,model){
                            var data=$cache.get(model);
                            if(data !==undefined && data.id !==undefined){
                                if(data.id===obj[id]){
                                    model.remove();
                                    rebind=true;
                                }
                            }else if(data && data.observers && data.observers.length){
                                data.observers.forEach(function(o){
                                    var id_=obj[id];
                                    if(o.value==='model-id' && o.value_===id_){
                                        model.remove();
                                        rebind=true;
                                    }
                                })
                            }
                        });
                    }
                });

                if(rebind){
                    self.__rebind();
                }
            }
        },


        /**
         * unbind path observers
         * @private
         */
        __unbindPathObservers:function(){
            var pathObservers=this._data.pathObservers;
            if(pathObservers && pathObservers.length && pathObservers.length >0){
                pathObservers.forEach(function(obj){
                    obj.observer.close();
                });
                utils.emptyArray(pathObservers);
            }
        },

        /**
         * unbind DOM mutation observer
         * @private
         */
        __unbindDOMObserver:function(){
            var DOMObserver=this._data.DOMObserver;
            if(DOMObserver){
                DOMObserver.disconnect();
            }

        },

        /**
         * unbind 2-way template binding
         * @private
         */
        __disposeTemplate: function(){
            this.__unbindDOMObserver();
            this.__unbindPathObservers();
        },

        /**
         * rebind template binding
         * @param render
         * @private
         */
        __rebindTemplate:function(render){
            if(this._data._watched){
                return false;
            }
            var repeat;
            if(typeof render==='undefined' || !render){
                repeat=true;
            }
            var template=this.__getTemplateNode();
            if(template[0]){
                this.__bind(repeat);
            }else if(this.options.loadedTemplate){
                this.__watchForTemplateInstance(repeat);
            }

            return true;
        },


        /**
         * watches for creation of a template instance before
         * firing template rebinding....e.g., ui-template tag is not initially part of the element DOM,
         * but included in the template rendered in by an element
         * @param repeat {Boolean}
         * @private
         */
        __watchForTemplateInstance:function(repeat){
            var self=this;
            var intervalId=setInterval(function(){
                var template=self.__getTemplateNode();
                if(template[0]){
                    clearInterval(intervalId);
                    self.__bind(repeat);
                }
            },100);
        },

        /**
         * reconnect disconnected MutationObserver
         * @private
         */
        __reconnect:function(){
            var observer=this._data.DOMObserver;
            if(observer){
                var template=this._data.templateNode;
                if(template[0]){
                    var node=template[0];
                    observer.observe(node, {childList: true,subtree:true});

                }
            }
        },

        /**
         *
         * @param delay {Number}
         * @private
         */
        _printPathObservers:function(delay){
           var self=this;
           if(delay===undefined){
               delay=0;
           }
            setTimeout(function(){
                console.log(self._data.pathObservers);
            },delay);
        },

        /**
         *
         * @param node {Object|Element}
         * @returns {String}
         * @private
         */
        _getModelIdByNode:function(node){
            return node.getAttribute('model-id');
        },

        /**
         *
         * @param target {Object} element
         * @returns {String}
         * @private
         */
        _getModelIdByTarget:function(target){
            var $target=$(target);
            var model=$target.parent('ui-model');
            return model.attr('model-id');
        },

        /**
         * returns the a model node cache object
         * @param node {Object} Element
         * @returns {Object}
         * @private
         */
        _getModelNodeCache:function(node){
            var $cache=this._data.$cache;
            return $cache.get(node);
        },

        /**
         * element cleanup onDelete
         * @private
         */
        _dispose:function(){
            this.__disposeTemplate();
        },


        _onDOMMutation: $.noop,

        _onRemovedNodes: $.noop,

        _onScopeChange: $.noop,

        /**
         * delete node facade
         * used to delete a model node from DOM via splice or shift operation passed in a function
         * NOTE: if you don't use the facade, then its up to the dev to handle $scope changes in terms of removing deletions from DOM
         * @param func {Function}
         * @public
         */
        $deleteNodes:function(func){
            var self=this;
            var path;
            this.__unbindPathObservers();
            var $scope=this.$scope;
            func.call(this);

            /* stringify passed function */
            var str=func.toString();

            /* splice */
            path=str.match(/scope.(.*?).splice/g);
            if(path && path.length){
                path.forEach(function(s){
                    s= s.replace('scope.','');
                    s= s.replace('.splice','');
                    var pos1=str.indexOf('splice(');
                    var pos2=str.indexOf(',',pos1);
                    pos1=pos1 + 7;
                    var index=str.substring(pos1,pos2);
                    var path_=s + '.' + index;
                    path_=path_.replace(/]/g,'');
                    path_=path_.replace(/[[\]]/g,'.');

                    /* remove from DOM */
                    self.__onListRemove(path_);

                })
            }

            /* shift */
            path=str.match(/scope.(.*?).shift/g);
            if(path && path.length){
                path.forEach(function(s){
                    s= s.replace('scope.','');
                    s= s.replace('.shift','');
                    var path_=s + '.0';
                    path_=path_.replace(/]/g,'');
                    path_=path_.replace(/[[\]]/g,'.');

                    /* remove from DOM */
                    self.__onListRemove(path_);

                })
            }

        },

        /**
         * add node facade
         * adds a ui-model node to the template DOM as a result of a push or unshift operation on the $scope passed in a function
         * NOTE: if you don't use the facade, then its up to the dev to handle $scope changes in terms of rendering additions
         * @param func {Function}
         */
        $addNodes:function(func){
            var self=this;
            var path;
            this.__unbindPathObservers();
            var $scope=this.$scope;
            func.call(this);

            /* stringify passed function */
            var str=func.toString();

            /* push */
            path=str.match(/scope.(.*?).push/g);

            if(path && path.length){
                path.forEach(function(s){
                    s= s.replace('scope.','');
                    s= s.replace('.push','');
                    var path_=s;
                    path_=path_.replace(/]/g,'');
                    path_=path_.replace(/[[\]]/g,'.');
                    var paths=path_.split('.');
                    var section=paths[paths.length-1];

                   /* add the model node to the template */
                    self.__onListAdd(path_,section,'push');
                })
            }

            /* unshift */
            path=str.match(/scope.(.*?).unshift/g);
            if(path && path.length){
                path.forEach(function(s){
                    s= s.replace('scope.','');
                    s= s.replace('.unshift','');
                    var path_=s;
                    path_=path_.replace(/]/g,'');
                    path_=path_.replace(/[[\]]/g,'.');
                    var paths=path_.split('.');
                    var section=paths[paths.length-1];

                    /* add the model node to the template */
                    self.__onListAdd(path_,section,'unshift');
                })
            }

            path=str.match(/scope.(.*?).concat/g);
            if(path && path.length){
                path=str.replace(/scope.(.*?).=/g,'');
                path=path.match(/scope.(.*?).concat/g);
                if(path && path.length){
                    path.forEach(function(s){
                        s= s.replace('scope.','');
                        s= s.replace('.concat','');
                        var path_=s;
                        path_=path_.replace(/]/g,'');
                        path_=path_.replace(/[[\]]/g,'.');
                        var paths=path_.split('.');
                        var section=paths[paths.length-1];
                        /* add the model nodes to the template */
                        self.__onListAdd(path_,section,'concat');
                    })
                }
            }


        },

        $empty:function(){
            var template=this.__getTemplateNode();
            if(this.__isModelList()){
                var prop=(this.options.scope !==undefined) ? this.options.scope : utils.objectPropertyByIndex(this.$scope,0);
                this.$scope[prop].length=0;
                template.empty();
            }else{
                this.$scope={};
                template.empty();
            }
        },

        $unbindTemplate: function(){
            this.__disposeTemplate();
        },

        $rebindTemplate:function(){
            this.__rebindTemplate();
        },

        $renderTemplate:function(opts,callback){
            opts.parse=false;
            this.__renderTemplate(opts,callback);
        },

        $rebind:function(){
            if(!this._data._watched){
                var template=this._data.templateNode;
                this.__unbindPathObservers();
                this.__databind(template,undefined,true);
                this.__reconnect();
            }
        }
    });

    return $;

}));