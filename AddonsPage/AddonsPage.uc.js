// ==UserScript==
// @name         AddonsPage.uc.js
// @description  附件组件页面右键新增查看所在目录，详细信息页面新增安装地址或路径，新增 uc脚本管理页面。
// @author       ywzhaiqi
// @include      main
// @charset      utf-8
// @version      0.8
// @downloadURL  https://raw.github.com/ywzhaiqi/userChromeJS/master/AddonsPage/AddonsPage.uc.js
// @homepageURL  https://github.com/ywzhaiqi/userChromeJS/tree/master/AddonsPage
// @reviewURL    http://bbs.kafan.cn/thread-1617407-1-1.html
// @optionsURL   about:config?filter=view_source.editor.path
// @note         - 附件组件页面右键新增查看所在目录（支持扩展、主题、插件）、复制名字。Greasemonkey、Scriptish 自带已经存在
// @note         - 附件组件详细信息页面新增GM脚本、扩展、主题安装地址和插件路径，右键即复制
// @note         - 新增 uc脚本管理页面
// @note         - 右键菜单 "查看附加组件" 需要 DOM Inspector
// @note         uc脚本管理界面
// @note         - 启用禁用需要 rebuild_userChrome.uc.xul
// @note         - 编辑命令需要首先设置 view_source.editor.path 的路径
// @note         - 图标请自行添加样式，详细信息见主页
// @note         其它信息见主页
// ==/UserScript==

location == "chrome://browser/content/browser.xul" && (function(){

     var iconURL = "";  // uc 脚本列表的图标，没法用 base64，类似下面的路径
    //var iconURL = "chrome://scriptish/skin/third-party/uso_medium.png";

    if(window.AM_Helper){
        window.AM_Helper.uninit();
        delete window.AM_Helper;
    }
    if(window.userChromeJSAddon){
        window.userChromeJSAddon.uninit();
        delete window.userChromeJSAddon;
    }

    let { classes: Cc, interfaces: Ci, utils: Cu, results: Cr } = Components;
    Cu.import("resource://gre/modules/Services.jsm");
    Cu.import("resource://gre/modules/AddonManager.jsm");
    Cu.import("resource://gre/modules/XPIProvider.jsm");

    var isCN = Services.prefs.getCharPref("general.useragent.locale").indexOf("zh") != -1;

    window.AM_Helper = {
        menuitem: {},

        init: function(){
            document.addEventListener("DOMContentLoaded", this, false);
        },
        uninit: function(){
            document.removeEventListener("DOMContentLoaded", this, false);
        },
        handleEvent: function(event){
            switch(event.type){
                case "DOMContentLoaded":
                    var doc = event.target;
                    var win = doc.defaultView;

                    if (["about:addons","chrome://mozapps/content/extensions/extensions.xul"].indexOf(doc.URL) == -1)
                        return;

                    this.addPopupMenu(doc);

                    // 给菜单调用
                    win.AM_Helper = AM_Helper;
                    this.win = win;

                    var self = this;
                    var observer = new MutationObserver(function(e) {
                        e = e[e.length-1];
                        if(e.attributeName == "loading") {
                            var doc = e.target.ownerDocument;
                            self.setUrlOrPath(doc);
                        }
                    });
                    observer.observe(doc.getElementById("detail-view"), {attributes: true});
                    break;
                case "popupshowing":
                    this.getAddon(this.win.document.popupNode.value,
                                  this.setItemsAttributes,
                                  event);
                    break;
            }
        },
        addPopupMenu: function(doc){
            var ins = doc.getElementById("menuitem_uninstallItem");
            if(!ins) return;

            ins = ins.nextSibling;
            var popup = ins.parentNode;

            var menuitem = $C("menuseparator", {
                id: "AM-separator-1"
            });
            popup.insertBefore(menuitem, ins);

            menuitem = $C("menuitem", {
                id: "AM-edit-script",
                label: isCN ? "编辑" : "Edit",
                accesskey: "e",
                hidden: true,
                oncommand: "AM_Helper.getAddon(AM_Helper.getPopupNode(this).value, AM_Helper.editScript);"
            });
            popup.insertBefore(menuitem, ins);

            menuitem = $C("menuitem", {
                id: "AM-inspect-addon",
                label: isCN ? "查看附加组件" : "Inspect Addon",
                accesskey: "i",
                tooltipText: isCN ? "调用 DOM Inspector 查看 addon 对象" : "inspect addon use DOM Inspector",
                oncommand: "AM_Helper.getAddon(AM_Helper.getPopupNode(this).value, AM_Helper.inspectAddon);"
            });
            popup.insertBefore(menuitem, ins);

            menuitem = $C("menuitem", {
                id: "AM-browse-dir",
                label: isCN ? "查看所在目录" : "Browser Dir",
                accesskey: "b",
                oncommand: "AM_Helper.getAddon(AM_Helper.getPopupNode(this).value, AM_Helper.browseDir);"
            });
            popup.insertBefore(menuitem, ins);

            menuitem = $C("menuitem", {
                id: "AM-open-url",
                label: isCN ? "打开安装页面" : "Open Install URL",
                accesskey: "u",
                tooltipText: null,
                oncommand: "openURL(this.tooltipText)",
            });
            popup.insertBefore(menuitem, ins);

            menuitem = $C("menuitem", {
                id: "AM-copy-name",
                label: isCN ? "复制名称" : "Copy Name",
                accesskey: "c",
                oncommand: "AM_Helper.getAddon(AM_Helper.getPopupNode(this).value, AM_Helper.copyName);"
            });
            popup.insertBefore(menuitem, ins);

            menuitem = $C("menuitem", {
                id: "AM-go-uso",
                class: "greasemonkey",
                hidden: true,
                label: isCN ? "在 Userscripts.org 上查看" : "View on Userscripts.org",
                oncommand: "openURL(this.tooltipText);"
            });
            popup.appendChild(menuitem);

            menuitem = $C("menuitem", {
                id: "AM-find-uso",
                class: "greasemonkey",
                hidden: true,
                label: isCN ? "在 Userscripts.org 上查找" : "Find on Userscripts.org",
                oncommand: "openURL(this.getAttribute('find-on-uso'));"
            });
            popup.appendChild(menuitem);

            popup.addEventListener("popupshowing", this, true);
        },
        setItemsAttributes: function(aAddon, event){
            var popup = event.target;
            var doc = popup.ownerDocument;

            function $(id) doc.getElementById(id)

            var isExtension = (aAddon.type == "extension");
            var isTheme = (aAddon.type == "theme");
            var isPlugin = (aAddon.type == "plugin");
            var isUserStyle = (aAddon.type == "userstyle");
            var isScriptish = (aAddon.type == "userscript");
            var isUserScript = (aAddon.type == "user-script") || // Greasemonkey
                               (aAddon.type == "userscript") ||  // Scriptish
                               (aAddon.type == "greasemonkey-user-script"); // Greasemonkey 1.7+
            var isUserChromeJS = (aAddon.type == "userchromejs");

            $("AM-browse-dir").hidden = isUserStyle || isUserScript;

            $("AM-edit-script").hidden = !isUserChromeJS;

            // install url
            var openInstallURLItem = $("AM-open-url");
            var installURL = this.getInstallURL(aAddon) || null;
            openInstallURLItem.tooltipText = installURL;
            openInstallURLItem.hidden = !installURL;

            var inspectItem = $("AM-inspect-addon");
            inspectItem.disabled = !("inspectObject" in window);
            inspectItem.className = isUserScript
                                    ? isScriptish
                                      ? ""
                                      : "greasemonkey"
                                    : "";

            var copyNameItem = $("AM-copy-name");
            copyNameItem.tooltipText = aAddon.name;

            if(isUserScript && !isScriptish){
                var usoRegx = /^https?:\/\/userscripts.org\/scripts\/source\/\d+.\w+.js$/;
                var usoURL = "";
                if (aAddon._script) {
                    var usDownloadURL = aAddon._script._downloadURL;
                    var usUpdateURL = aAddon._script._updateURL;
                    if (usoRegx.test(usDownloadURL)) {
                        usoURL = usDownloadURL;
                    } else if (usoRegx.test(usUpdateURL)) {
                        usoURL = usUpdateURL;
                    }
                }

                var usoItem = $("AM-go-uso");
                usoItem.disabled = !usoRegx.test(usoURL);
                usoItem.className = isUserScript ? usoItem.disabled ? "" : "greasemonkey" : "";
                usoItem.tooltipText = usoURL.replace(/source/, "show")
                    .replace(/.\w+.js$/, "");

                var fusoItem = $("AM-find-uso");
                fusoItem.disabled = usoRegx.test(usoURL);
                fusoItem.className = isUserScript ? fusoItem.disabled ? "" : "greasemonkey" : "";
                fusoItem.setAttribute("find-on-uso",
                    "http://userscripts.org/scripts/search?q=" + encodeURIComponent(aAddon.name));
            }
        },

        getPopupNode: function (aNode) {
            var doc = aNode.ownerDocument;
            return "triggerNode" in aNode.parentNode ? aNode.parentNode.triggerNode : doc.popupNode;
        },
        getAddon: function (aId, aCallback, aEvent) {
            var self = this;

            if (this.win.gDetailView._addon) {
                aCallback.apply(this, [this.win.gDetailView._addon, aEvent]);
                return;
            }

            AddonManager.getAllAddons(function(aAddons) {
                for (var i = 0; i < aAddons.length; i++) {
                    if (aAddons[i].id == aId) {
                        aCallback.apply(self, [aAddons[i], aEvent]);
                        return;
                    }
                }
            });
        },

        inspectAddon: function (aAddon) {
            inspectObject(aAddon);
        },
        inspectUserscript: function (aAddon) {
            inspectObject(aAddon._script);
        },
        browseDir: function (aAddon) {
            switch(aAddon.type){
                case "plugin":
                    var pathes = aAddon.pluginFullpath;
                    for (var i = 0; i < pathes.length; i++) {
                        this.revealPath(pathes[i]);
                    }
                    return;
                case "userchromejs":
                    var file = aAddon._script.file;
                    if(file.exists())
                        file.reveal();
                    return;
            }

            // addon
            var gecko = parseInt(Services.appinfo.platformVersion);
            var nsLocalFile = Components.Constructor("@mozilla.org/file/local;1", (gecko >= 14) ? "nsIFile" : "nsILocalFile",
                "initWithPath");

            var dir = Services.dirsvc.get("ProfD", Ci.nsIFile);
            dir.append("extensions");
            dir.append(aAddon.id);
            var fileOrDir = dir.path + (dir.exists() ? "" : ".xpi");
            //Application.console.log(fileOrDir);
            try {
                (new nsLocalFile(fileOrDir)).reveal();
            } catch (ex) {
                var addonDir = /.xpi$/.test(fileOrDir) ? dir.parent : dir;
                try {
                    if (addonDir.exists()) {
                        addonDir.launch();
                    }
                } catch (ex) {
                    var uri = Services.io.newFileURI(addonDir);
                    var protSvc = Cc["@mozilla.org/uriloader/external-protocol-service;1"].
                    getService(Ci.nsIExternalProtocolService);
                    protSvc.loadUrl(uri);
                }
            }
        },
        editScript: function(aAddon) {
            if(aAddon.type == "userchromejs"){
                var path = aAddon._script.file.path;
                this.launchEditor(path);
            }
        },
        launchEditor: function(path){
            var editor = Services.prefs.getCharPref("view_source.editor.path");
            var UI = Cc['@mozilla.org/intl/scriptableunicodeconverter'].createInstance(Ci.nsIScriptableUnicodeConverter);

            var platform = window.navigator.platform.toLowerCase();
            if (platform.indexOf('win') > -1) {
                UI.charset = 'GB2312'; // Shift_JIS
            } else {
                UI.charset = 'UTF-8';
            }

            path = UI.ConvertFromUnicode(path);

            var appfile = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsILocalFile);
            appfile.initWithPath(editor);
            var process = Cc['@mozilla.org/process/util;1'].createInstance(Ci.nsIProcess);
            process.init(appfile);
            process.run(false, [path], 1, {});
        },
        copyName: function (aAddon) {
            this.copyToClipboard(aAddon.name);
        },
        getInstallURL: function(aAddon){
            aAddon = aAddon || this.win.gViewController.viewObjects.detail._addon;
            if(!aAddon) return null;

            var url = null;
            switch(aAddon.type){
                case "extension":
                case "theme":
                    url = (aAddon.contributionURL || aAddon.reviewURL) || null;
                    return url && url.replace(/\/developers|\/reviews/g,"");
                case "greasemonkey-user-script":
                    return aAddon._script && aAddon._script.downloadURL.replace(/(^.+)source\/(\d+).*$/,"$1show/$2");
                case "userscript":
                    if(aAddon._updateURL){
                        url = aAddon._updateURL.replace(/(^.+)source\/(\d+).*$/,"$1show/$2");
                    }else{
                        url = "http://userscripts.org/scripts/search?q=" + encodeURIComponent(aAddon.name);
                    }
                    return url;
                case "userchromejs":
                    return aAddon.homepageURL || aAddon.reviewURL;
                default:
                    return aAddon.homepageURL;
            }
        },

        get getPath(){
            var url = this.win.gViewController.viewObjects.detail._addon;
            if(!url) return false;
            return url.pluginFullpath || false;
        },
        setUrlOrPath :function(doc){
            var installURL = this.getInstallURL();
            if (!installURL && !this.getPath) return;

            if(!doc.getElementById("detail-InstallURL-row")){
                var value = "",label = "";
                if(this.win.gViewController.currentViewId.indexOf("detail")!= -1){
                    switch (this.win.gViewController.viewObjects.detail._addon.type){
                        case "extension":
                        case "theme":
                        case "greasemonkey-user-script":
                            value = installURL;
                            label = "%Installpage%";
                            break;
                        case "plugin":
                            value = this.getPath;
                            label = "%Path%";
                            break;
                    }
                }
                if(!!value && !!label){
                    var xul = "";
                    if(typeof(value) != "string"){
                        xul = "<vbox>";
                        for(var i=0;i< value.length;i++){
                            xul += ('<label class="detail-row-value text-link" crop="end" onclick="\
                                if(event.button == 0) { \
                                    AM_Helper.revealPath(this.value); \
                                } else if (event.button == 2){ \
                                    AM_Helper.copyToClipboard(this.value); \
                                } \
                                return false;" \
                                value="' + value[i] +'" href="'+ value[i] +'"/>');
                        }
                        xul += "</vbox>";
                    }else{
                        xul = '<label class="detail-row-value text-link" crop="end" onclick="\
                            if(event.button == 2){\
                                AM_Helper.copyToClipboard(this.value); \
                                return false;\
                            }" value="'+ value +'" href="'+ value +'"/>';
                    }
                    xul = '<row class="detail-row-complex" id="detail-InstallURL-row" label="'+ label +'">'+
                                '<label class="detail-row-label" value="'+ label +'"/>'+ xul +'</row>';
                    if(isCN){
                        xul = xul.replace(/\%Installpage\%/g, "安装页面").replace(/\%Path\%/g, "路径");
                    }else{
                        xul = xul.replace(/\%/g,"");
                    }
                    doc.getElementById("detail-rows").innerHTML += xul;
                }
            }
        },
        revealPath: function(path){
            var file = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsILocalFile);
            file.initWithPath(path);
            if(file.exists())
                file.reveal();
        },
        copyToClipboard: function (aString) {
            Cc["@mozilla.org/widget/clipboardhelper;1"].
                getService(Ci.nsIClipboardHelper).copyString(aString);
        }
    };

    window.userChromeJSAddon = {
        scripts:[],
        unloads: [],

        init: function(){
            if("userchromejs" in AddonManager.addonTypes) return;

            this.initScripts();
            this.registerProvider();
            this.addStyle();
        },
        uninit: function(){
            this.unloads.forEach(function(func){ func(); });
        },
        initScripts: function(){
            var scripts = window.userChrome_js.scripts.concat(window.userChrome_js.overlays);

            var self = this;
            self.scripts = [];
            scripts.forEach(function(script, i){
                self.scripts[i] = new ScriptAddon(script);
            });
        },
        getScriptById: function(aId){
            for (var i = 0; i < this.scripts.length; i++) {
                if(this.scripts[i].id == aId)
                    return this.scripts[i];
            }
            return null;
        },
        registerProvider: function(){
            var types = null;
            if (AddonManagerPrivate.AddonType) {
                types = [new AddonManagerPrivate.AddonType(
                    "userchromejs",
                    "",
                    isCN ? "uc 脚本" : "userChrome JS",
                    AddonManager.VIEW_TYPE_LIST,
                    9000)];
            }

            let provider = {
                getAddonByID: function(aId, aCallback) {
                    let script = userChromeJSAddon.getScriptById(aId);
                    aCallback(script);
                },

                getAddonsByTypes: function(aTypes, aCallback) {
                    if (aTypes && aTypes.indexOf("userchromejs") < 0) {
                        aCallback([]);
                    } else {
                        aCallback(userChromeJSAddon.scripts);
                    }
                }
            };

            AddonManagerPrivate.registerProvider(provider, types);

            this.unloads.push(function(){
                AddonManagerPrivate.unregisterProvider(provider);
            });
        },
        addStyle: function(){
            let data = '@namespace url(http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul);\
                \
                @-moz-document url("about:addons"), url("chrome://mozapps/content/extensions/extensions.xul") {\
                    #category-userchromejs > .category-icon {\
                        list-style-image: url(data:image/png;base64,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);\
                    }\
                }';
            let styleService = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
            let styleURI = Services.io.newURI("data:text/css," + encodeURIComponent(data), null, null);
            styleService.loadAndRegisterSheet(styleURI, Ci.nsIStyleSheetService.USER_SHEET);

            this.unloads.push(function(){
                styleService.unregisterSheet(styleURI, Ci.nsIStyleSheetService.USER_SHEET);
            });
        },
    };

    function ScriptAddon(aScript){
        this._script = aScript;

        this.id = this._script.url;
        this.name = this._script.filename;
        this.description = this._script.description;
        this.enabled = !userChrome_js.scriptDisable[this.name];

        // 我修改过的 userChrome.js 新增的
        this.version = this._script.version || null;
        this.author = this._script.author || null;
        this.homepageURL = this._script.homepageURL || null;
        this.reviewURL = this._script.reviewURL || null;
        this.reviewCount = 0;
        this.fullDescription = this._script.fullDescription || null;
        this.downloadURL = this._script.downloadURL || null;

        this.iconURL = iconURL;
    }

    ScriptAddon.prototype = {
        version: null,
        type: "userchromejs",
        isCompatible: true,
        blocklistState: 0,
        appDisabled: false,
        scope: AddonManager.SCOPE_PROFILE,
        name: null,
        creator: null,
        pendingOperations: AddonManager.PENDING_NONE,  // 必须，否则所有都显示 restart
        operationsRequiringRestart: 6,
        // operationsRequiringRestart: AddonManager.OP_NEEDS_RESTART_DISABLE,

        get optionsURL(){
            if (this.isActive && this._script.optionsURL)
                return this._script.optionsURL;
        },

        get isActive() !this.userDisabled,
        get userDisabled() !this.enabled,
        set userDisabled(val) {
            if (val == this.userDisabled) {
                return val;
            }

            AddonManagerPrivate.callAddonListeners(val ? 'onEnabling' : 'onDisabling', this, false);

            if(this.pendingOperations == AddonManager.PENDING_NONE){
                this.pendingOperations = val ? AddonManager.PENDING_DISABLE : AddonManager.PENDING_ENABLE;
            }else{
                this.pendingOperations = AddonManager.PENDING_NONE;
            }

            this.enabled = !val;
            if(window.userChromejs){
                userChromejs.chgScriptStat(this.name);
            }

            AddonManagerPrivate.callAddonListeners(val ? 'onEnabled' : 'onDisabled', this);
        },
        get permissions() {
            // var perms = AddonManager.PERM_CAN_UNINSTALL;
            // perms |= this.userDisabled ? AddonManager.PERM_CAN_ENABLE : AddonManager.PERM_CAN_DISABLE;
            var perms = this.userDisabled ? AddonManager.PERM_CAN_ENABLE : AddonManager.PERM_CAN_DISABLE;
            // if (this.updateURL) perms |= AddonManager.PERM_CAN_UPGRADE;
            return perms;
        },

        uninstall: function() {
            AddonManagerPrivate.callAddonListeners("onUninstalling", this, false);
            this.needsUninstall = true;
            this.pendingOperations |= AddonManager.PENDING_UNINSTALL;
            AddonManagerPrivate.callAddonListeners("onUninstalled", this);
        },
        cancelUninstall: function() {
            this.needsUninstall = false;
            this.pendingOperations ^= AddonManager.PENDING_UNINSTALL;
            AddonManagerPrivate.callAddonListeners("onOperationCancelled", this);
        },
    };


    AM_Helper.init();

    userChromeJSAddon.init();

    function $C(name, attr) {
        var el = document.createElement(name);
        if (attr) Object.keys(attr).forEach(function(n) el.setAttribute(n, attr[n]));
        return el;
    }
})();