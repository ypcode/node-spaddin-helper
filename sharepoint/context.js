"use strict";
const token_helper_1 = require("./token-helper");
const client_1 = require("./client");
const url_1 = require("../helpers/url");
;
class SharePointContext {
    constructor(SPHostUrl, SPAppWebUrl, SPLanguage, SPClientTag, SPProductNumber, contextTokenStr, contextToken) {
        this.SPHostUrl = SPHostUrl;
        this.SPAppWebUrl = SPAppWebUrl;
        this.SPLanguage = SPLanguage;
        this.SPClientTag = SPClientTag;
        this.SPProductNumber = SPProductNumber;
        this.contextTokenStr = contextTokenStr;
        this.contextToken = contextToken;
        this.cacheKey = null;
        if (!SPHostUrl)
            throw new Error("SPHostUrl is required.");
        // if (!SPProductNumber) throw new Error("SPProductNumber is required.");
        // if (!SPLanguage) throw new Error("SPLanguage is required.");
        // if (!SPClientTag) throw new Error("SPCLientTag is required.");
    }
    static getSPHostUrl(request) {
        if (!request)
            throw new Error("httpRequest is undefined or null");
        let urlWithEnsuredSlash = url_1.Url.ensureTrailingSlash(request.query.SPHostUrl);
        if (!urlWithEnsuredSlash) {
            let sphostUrlFromCookie = request.cookies.SpContextParameters && url_1.Url.parseQueryString(request.cookies.SpContextParameters).SPHostUrl;
            urlWithEnsuredSlash = url_1.Url.ensureTrailingSlash(sphostUrlFromCookie);
        }
        // Check if well formed HTTP URL
        if (urlWithEnsuredSlash) {
            if (urlWithEnsuredSlash.indexOf("http://") == 0 || urlWithEnsuredSlash.indexOf("https://") == 0) {
                console.log("SPHostUrl = " + urlWithEnsuredSlash);
                return urlWithEnsuredSlash;
            }
        }
        return null;
    }
    static loadFromRequest(req) {
        // If no context cache mechanism is specified, return nothing
        if (!SharePointContext.ContextCacheHandler)
            return null;
        let info = SharePointContext.ContextCacheHandler.load(req);
        return info && SharePointContext.createFromContextInfo(info);
    }
    static validateContext(context, req) {
        // TODO Implement this
        // Compare current request and context
        let spHostUrl = SharePointContext.getSPHostUrl(req);
        let contextTokenStr = token_helper_1.TokenHelper.getContextTokenFromRequest(req);
        let spCacheKey = req.cookies.SPCacheKey;
        return spHostUrl == context.SPHostUrl
            && (!spCacheKey || spCacheKey == context.cacheKey)
            && context.contextToken && (!contextTokenStr || contextTokenStr == context.contextTokenStr);
    }
    static save(context, req) {
        // req.session.SPContext = context;
        // If no context cache mechanism is specified, don't do anything
        if (!SharePointContext.ContextCacheHandler)
            return;
        return SharePointContext.ContextCacheHandler.save(req, context.getContextInfo());
    }
    static getFromRequest(req) {
        if (!req)
            throw new Error("The HTTP request cannot be found");
        console.log("Get context from request");
        let spHostUrl = SharePointContext.getSPHostUrl(req);
        if (!spHostUrl)
            return null;
        console.log("Load context from server according to request");
        let spContext = SharePointContext.loadFromRequest(req);
        if (!spContext || !SharePointContext.validateContext(spContext, req)) {
            console.log("Context not loaded or invalid");
            spContext = SharePointContext.createFromRequest(req);
            if (spContext) {
                console.log("Context created");
                SharePointContext.save(spContext, req);
            }
            else {
                console.log("Context not created");
            }
        }
        return spContext;
    }
    getContextInfo() {
        return {
            SPHostUrl: this.SPHostUrl,
            SPAppWebUrl: this.SPAppWebUrl,
            SPLanguage: this.SPLanguage,
            SPClientTag: this.SPClientTag,
            SPProductNumber: this.SPProductNumber,
            contextToken: this.contextToken,
            contextTokenStr: this.contextTokenStr
        };
    }
    static createFromContextInfo(info) {
        return new SharePointContext(info.SPHostUrl, info.SPAppWebUrl, info.SPLanguage, info.SPClientTag, info.SPProductNumber, info.contextTokenStr, info.contextToken);
    }
    static createFromRequest(req) {
        if (!req)
            throw new Error("Request is not specified");
        // SPHostUrl
        let spHostUrl = SharePointContext.getSPHostUrl(req);
        if (!spHostUrl)
            return null;
        var query = req.query;
        // SPAppWebUrl
        let spAppWebUrl = url_1.Url.ensureTrailingSlash(query.SPAppWebUrl);
        if (!url_1.Url.validateHttpSchemes(spAppWebUrl, ['http', 'https']))
            spAppWebUrl = null;
        if (!query.SPLanguage)
            return null;
        if (!query.SPClientTag)
            return null;
        if (!query.SPProductNumber)
            return null;
        return SharePointContext.create(spHostUrl, query.SPAppWebUrl, query.SPLanguage, query.SPClientTag, query.SPProductNumber, req);
    }
    static create(spHostUrl, spAppWebUrl, spLanguage, spClientTag, spProductNumber, request) {
        let contextTokenStr = token_helper_1.TokenHelper.getContextTokenFromRequest(request);
        if (!contextTokenStr)
            return null;
        try {
            var contextTokenObj = token_helper_1.TokenHelper.readAndValidateContext(contextTokenStr, request.hostname);
            return new SharePointContext(spHostUrl, spAppWebUrl, spLanguage, spClientTag, spProductNumber, contextTokenStr, contextTokenObj);
        }
        catch (error) {
            return null;
        }
    }
    static createRESTClient(spSiteUrl, accessToken) {
        if (spSiteUrl && accessToken)
            return new client_1.SharePointRestClient(spSiteUrl, accessToken);
        return null;
    }
    createClientForSPHost() {
        // If the token is already in cache and stil valid
        if (this.userAccessTokenForSPHost
            && this.userAccessTokenForSPHost.token
            && this.userAccessTokenForSPHost.expired < new Date()) {
            let promise = new Promise(resolve => {
                let client = SharePointContext.createRESTClient(this.SPHostUrl, this.userAccessTokenForSPHost.token);
                resolve(client);
            });
        }
        return token_helper_1.TokenHelper.getAccessToken(this.contextToken, this.SPHostUrl).then(token => {
            this.userAccessTokenForSPHost = { expired: new Date(Date.parse(token.expires_on)), token: token.access_token };
            return SharePointContext.createRESTClient(this.SPHostUrl, token.access_token);
        });
    }
    createAppOnlyClientForSPHost() {
        // If the token is already in cache and stil valid
        if (this.appOnlyAccessTokenForSPHost
            && this.appOnlyAccessTokenForSPHost.token
            && this.appOnlyAccessTokenForSPHost.expired < new Date()) {
            let promise = new Promise(resolve => {
                let client = SharePointContext.createRESTClient(this.SPHostUrl, this.appOnlyAccessTokenForSPHost.token);
                resolve(client);
            });
        }
        return token_helper_1.TokenHelper.getAccessToken(this.contextToken, this.SPHostUrl, true).then(token => {
            this.appOnlyAccessTokenForSPHost = { expired: new Date(Date.parse(token.expires_on)), token: token.access_token };
            return SharePointContext.createRESTClient(this.SPHostUrl, token.access_token);
        });
    }
}
SharePointContext.SPHostUrlKey = "SPHostUrl";
SharePointContext.SPAppWebUrlKey = "SPAppWebUrl";
SharePointContext.SPLanguageKey = "SPLanguage";
SharePointContext.SPClientTagKey = "SPClientTag";
SharePointContext.SPProductNumberKey = "SPProductNumber";
SharePointContext.ContextCookieName = "SpContextParameters";
SharePointContext.AccessTokenLifetimeToleranceInMilliSeconds = 5 * 60 * 1000; // 5 Minutes
exports.SharePointContext = SharePointContext;
//# sourceMappingURL=context.js.map