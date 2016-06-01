'use strict';
/*global WebViewJavascriptBridge*/
/*global _WebViewJavascriptBridge*/
import {
  DeviceEventEmitter,
  NativeAppEventEmitter,
  NativeModules
} from 'react-native';

export function initialize() {
  if (window.WebViewJavascriptBridge) {
    return;
  }
  var messagingIframe;
  var sendMessageQueue = [];
  var receiveMessageQueue = [];
  var messageHandlers = {};

  var CUSTOM_PROTOCOL_SCHEME = 'wvjbscheme';
  var QUEUE_HAS_MESSAGE = '__WVJB_QUEUE_MESSAGE__';

  var responseCallbacks = {};
  var uniqueId = 1;

  function _createQueueReadyIframe(doc) {
    messagingIframe = doc.createElement('iframe');
    messagingIframe.style.display = 'none';
    messagingIframe.src = CUSTOM_PROTOCOL_SCHEME + '://' + QUEUE_HAS_MESSAGE;
    doc.documentElement.appendChild(messagingIframe);
  }

  function init(messageHandler) {
    if (WebViewJavascriptBridge._messageHandler) {
      throw new Error('WebViewJavascriptBridge.init called twice');
    }
    WebViewJavascriptBridge._messageHandler = messageHandler;
    var receivedMessages = receiveMessageQueue;
    receiveMessageQueue = null;
    for (var i = 0; i < receivedMessages.length; i++) {
      _dispatchMessageFromObjC(receivedMessages[i]);
    }
  }

  function send(data, responseCallback) {
    _doSend({
      data: data
    }, responseCallback);
  }

  function registerHandler(handlerName, handler) {
    if (navigator.product.match(/ReactNative/)) {
      // for ios devices
      NativeAppEventEmitter.addListener(handlerName, handler);
      // for android devices
      DeviceEventEmitter.addListener(handlerName, handler);
    } else {
      messageHandlers[handlerName] = handler;
    }
  }

  function callHandler(handlerName, data, responseCallback) {
    _doSend({
      handlerName: handlerName,
      data: data
    }, responseCallback);
  }

  function _doSend(message, responseCallback) {
    if (responseCallback) {
      var callbackId = 'cb_' + (uniqueId++) + '_' + new Date().getTime();
      responseCallbacks[callbackId] = responseCallback;
      message['callbackId'] = callbackId;
    }
    if (navigator.product.match(/ReactNative/)) {
      NativeModules.SCBridge.handler(message);
    } else if (navigator.userAgent.match(/(iPhone|iPod|iPad)/)) {
      sendMessageQueue.push(message);
      messagingIframe.src = CUSTOM_PROTOCOL_SCHEME + '://' + QUEUE_HAS_MESSAGE;
    } else if (navigator.userAgent.match(/Android/)) {
      _WebViewJavascriptBridge._handleMessageFromJs(
        typeof message.data === 'object' ? JSON.stringify(message.data) : (message.data || null),
        message.responseId || null,
        message.responseData || null,
        message.callbackId || null,
        message.handlerName || null
      );
    }
  }

  function _fetchQueue() {
    var messageQueueString = JSON.stringify(sendMessageQueue);
    sendMessageQueue = [];
    return messageQueueString;
  }

  function _dispatchMessageFromObjC(messageJSON) {
    setTimeout(function _timeoutDispatchMessageFromObjC() {
      var message = JSON.parse(messageJSON);
      var responseCallback;

      if (message.responseId) {
        responseCallback = responseCallbacks[message.responseId];
        if (!responseCallback) {
          return;
        }
        responseCallback(message.responseData);
        delete responseCallbacks[message.responseId];
      } else {
        if (message.callbackId) {
          var callbackResponseId = message.callbackId;
          responseCallback = function(responseData) {
            _doSend({
              responseId: callbackResponseId,
              responseData: responseData
            });
          };
        }

        var handler = WebViewJavascriptBridge._messageHandler;
        if (message.handlerName) {
          handler = messageHandlers[message.handlerName];
        }

        try {
          handler(message.data, responseCallback);
        } catch (exception) {
          if (typeof console != 'undefined') {
            console.log('WebViewJavascriptBridge: WARNING: javascript handler threw.', message, exception);
          }
        }
      }
    });
  }

  function _handleMessageFromObjC(messageJSON) {
    if (receiveMessageQueue) {
      receiveMessageQueue.push(messageJSON);
    } else {
      _dispatchMessageFromObjC(messageJSON);
    }
  }

  function _dispatchMessageFromJava(messageJSON) {
    var message = JSON.parse(messageJSON);
    var responseCallback;
    if (message.responseId) {
      responseCallback = responseCallbacks[message.responseId];
      if (!responseCallback) {
        return;
      }
      responseCallback(message.responseData);
      delete responseCallbacks[message.responseId];
    } else {
      if (message.callbackId) {
        var callbackResponseId = message.callbackId;
        responseCallback = function(responseData) {
          _doSend({
            responseId: callbackResponseId,
            responseData: responseData
          });
        };
      }

      var handler = WebViewJavascriptBridge._messageHandler;
      if (message.handlerName) {
        handler = messageHandlers[message.handlerName];
      }
      try {
        handler(message.data, responseCallback);
      } catch (exception) {
        if (typeof console !== 'undefined') {
          console.log('WebViewJavascriptBridge: WARNING: javascript handler threw.', message, exception);
        }
      }
    }
  }

  function _handleMessageFromJava(messageJSON) {
    console.log('recieved message from java: ' + messageJSON);
    _dispatchMessageFromJava(messageJSON);
  }

  window.WebViewJavascriptBridge = {
    init: init,
    send: send,
    registerHandler: registerHandler,
    callHandler: callHandler,
    _fetchQueue: _fetchQueue,
    _handleMessageFromObjC: _handleMessageFromObjC,
    _handleMessageFromJava: _handleMessageFromJava
  };

  if (!navigator.product.match(/ReactNative/)) {
    var doc = document;
    _createQueueReadyIframe(doc);
    var readyEvent = doc.createEvent('Events');
    readyEvent.initEvent('WebViewJavascriptBridgeReady');
    readyEvent.bridge = WebViewJavascriptBridge;
    doc.dispatchEvent(readyEvent);
  }

  return {};

}