const NodeCache = require("node-cache");

module.exports = function(RED) {

  function cacheNode(n) {
    var node = this;
    RED.nodes.createNode(node, n);
    node.name = n.name;
    node.cache = new NodeCache({
      stdTTL: n.defaultTtl || 0,
      checkperiod: n.checkPeriod || 0,
    });
    node.cache.nodeList = [];
    node.cache.addNode = function(newNode) {
      this.nodeList.push(newNode);
    };
    node.cache.onChanged = function() {
      this.nodeList.forEach((n) => {
        n.emit("updated");
      });
    };
    ["set", "del", "expired", "flush"].forEach((e) => {
      node.cache.on(e, node.cache.onChanged);
    });
    node.on("close", function() {
      node.cache.close();
      delete node.cache;
    });
  }

  RED.nodes.registerType("Cache", cacheNode);

  function cacheInNode(n) {
    var node = this;
    RED.nodes.createNode(node, n);
    node.keyProperty = n.keyProperty || "topic";
    node.valueProperty = n.valueProperty || "payload";
    node.useString = n.useString;
    node.cacheMissRouting = n.outputs > 1;
    node.cacheNodeId = n.cache;
    node.cacheNode = RED.nodes.getNode(node.cacheNodeId);
    if (node.cacheNode) {
      node.cacheNode.cache.addNode(node);
      node.on("updated", function() {
        node.status({
          fill: "green",
          shape: "dot",
          text: RED._("cache.status.keys", {
            n: node.cacheNode.cache.getStats().keys,
          }),
        });
      });
    }
    node.name = n.name;
    let sendMessage = function(msg, cacheMiss) {
      if (node.cacheMissRouting) {
        let ports = [];
        ports[cacheMiss ? 1 : 0] = msg;
        node.send(ports);
      } else {
        node.send(msg);
      }
    };
    let del = function(msg, key) {
      let count = node.cacheNode.cache.del(key);
      msg.payload = count;
      sendMessage(msg);
    };
    let dump = function(msg, likeKey) {
      node.cacheNode.cache.keys((err, keys) => {
        if (!err) {
          let filterKeys = [];
          if (likeKey) {
            keys.forEach((k) => {
              if (k.startsWith(likeKey)) {
                filterKeys.push(k);
              }
            });
          }
          node.cacheNode.cache.mget(filterKeys, (err, value) => {
            RED.util.setMessageProperty(msg, node.valueProperty, value);
            sendMessage(msg);
          });
        }
      });
    };
    let keys = function(msg, likeKey) {
      let result = [];
      const allKeys = node.cacheNode.cache.keys();
      if (likeKey && allKeys) {
        allKeys.forEach((key) => {
          if (key.startsWith(likeKey)) {
            result.push(key);
          }
        });
      } else {
        result = allKeys;
      }
      RED.util.setMessageProperty(msg, node.valueProperty, result);
      sendMessage(msg);
    };
    const getLike = function(msg, likeKey) {
      let result = [];
      const allKeys = node.cacheNode.cache.keys();
      if (likeKey && allKeys) {
        allKeys.forEach((key) => {
          if (key.startsWith(likeKey)) {
            const value = node.cacheNode.cache.get(key);
            // maybe expired since keys() call
            let cacheMiss = value === undefined;
            result.push(value === "" || cacheMiss ? null : value);
          }
        });
      } else {
        result = allKeys;
      }
      RED.util.setMessageProperty(msg, node.valueProperty, result);
      // 0 length triggers cache miss
      sendMessage(msg, result.length === 0);
    };
    node.on("input", function(msg) {
      if (node.cacheNode) {
        let key = RED.util.getMessageProperty(msg, node.keyProperty);
        if (msg.option) {
          if (msg.option === "delete") {
            del(msg, key);
          } else if (msg.option === "dump") {
            dump(msg, key);
          } else if (msg.option === "keys") {
            keys(msg, key);
          } else if (msg.option === "getLike") {
            getLike(msg, key);
          }
        } else {
          if (key) {
            const value = node.cacheNode.cache.get(key);
            let cacheMiss = value === undefined;
            RED.util.setMessageProperty(
              msg,
              node.valueProperty,
              value === "" || cacheMiss ? null : value
            );
            sendMessage(msg, cacheMiss);
          }
        }
      }
    });
    process.nextTick(function() {
      node.emit("updated");
    });
  }

  RED.nodes.registerType("Cache in", cacheInNode);

  function cacheOutNode(n) {
    var node = this;
    RED.nodes.createNode(node, n);
    node.keyProperty = n.keyProperty || "topic";
    node.valueProperty = n.valueProperty || "payload";
    node.ttlProperty = n.ttlProperty || "";
    node.useString = n.useString;
    node.cacheNodeId = n.cache;
    node.cacheNode = RED.nodes.getNode(node.cacheNodeId);
    if (node.cacheNode) {
      node.cacheNode.cache.addNode(node);
      node.on("updated", function() {
        node.status({
          fill: "green",
          shape: "dot",
          text: RED._("cache.status.keys", {
            n: node.cacheNode.cache.getStats().keys,
          }),
        });
      });
    }
    node.name = n.name;
    node.on("input", function(msg) {
      if (node.cacheNode) {
        let key = RED.util.getMessageProperty(msg, node.keyProperty);
        if (key) {
          let value = RED.util.getMessageProperty(msg, node.valueProperty);
          if (node.ttlProperty) {
            let ttl = RED.util.getMessageProperty(msg, node.ttlProperty) || 0;
            node.cacheNode.cache.set(key, value, ttl);
          } else {
            node.cacheNode.cache.set(key, value);
          }
        }
      }
    });
    process.nextTick(function() {
      node.emit("updated");
    });
  }

  RED.nodes.registerType("Cache out", cacheOutNode);
}
