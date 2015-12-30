
var omlib;
var om;
var accountDb = false;
var feedsDb = false;
var recentFeeds = "";
var _notifications = {};

var imgList = [];
var linksList = [];
var unreadCount = 0;

// Chrome Notifications Section
function onMessagePushed(msg) {
    omlib.store.getAccounts(function (accountsDb) {
        accountsDb.getObjectByKey(msg.Owner, function(err, sender) {
            //if (!sender.owned) {
                handleNotification(sender, msg)
            //}
        });
    });
}

function handleNotification(sender, msg) {
    var showTextNotifications = false;
    var type = msg.Id.Type;
    var obj = JSON.parse(msg.Body);
    var title = "Omlet Chat";
    
    if (showTextNotifications && type == "text") {
        if (sender && sender.name) {
            title = "Message from " + sender.name;
        }
        var opt = {
          type: "basic",
          title: title,
          message: obj.text,
          iconUrl: "assets/icon-48.png"
        }
        chrome.notifications.create(undefined, opt, function(id) {
            _notifications[id] = msg;
        });
    }

    if ((type == "rdl" || type == "app") && obj.noun == "story") {
        if (sender && sender.name) {
            title = "Story from " + sender.name;
        }

        var text;
        if (obj.displayTitle && obj.displayText) {
            text = obj.displayTitle + "\n" + obj.displayText + "\n\n" + obj.webCallback;
        } else if (obj.displayTitle) {
            text = obj.displayTitle + "\n\n" + obj.webCallback;
        } else if (obj.displayText) {
            text = obj.displayText + "\n\n" + obj.webCallback;
        } else {
            text = obj.webCallback;
        }

        addUnseenContent(msg);
    }

    if (type == "picture" || type == "canvas") {
        //addUnseenContent(msg);
    }
}

function addUnseenContent(msg) {
    unreadCount++;
    chrome.browserAction.setBadgeBackgroundColor({ color: [255, 0, 0, 255] });
    chrome.browserAction.setBadgeText({text: ""+unreadCount});

    var opt = {
      type: "basic",
      title: "New Link!",
      message: unreadCount + " unread links",
      iconUrl: "assets/icon-48.png"
    }
    chrome.notifications.create(undefined, opt, function(id) {
        _notifications[id] = msg;
    });
    links.unshift(msg);
}

function clearUnread() {
    unreadCount = 0;
}

function onNotificationClicked(notificationId) {
    return;

    var msg = _notifications[notificationId];
    if (!msg)
        return;

    var type = msg.Id.Type;
    var obj = JSON.parse(msg.Body);
    if (type == "app" || type == "rdl") {
        chrome.tabs.create({ url: obj.webCallback });
    }
}

function onNotificationClosed(notificationId) {
    delete _notifications[notificationId];
}

//
// End Chrome notifications section

function showRecents() {
  if (!feedsDb) {
    console.log("Meow!! No feeds!!");
    return;
  }
  var limit = 25;
  var res = "";

  window.clearUnread();

  var list = document.createElement("div");

  var tag = "";
  var feeds = feedsDb._data.chain().find().simplesort("renderableTime", true).limit(limit).data();
  feeds.forEach(function(feed) {

    var name = feed.name;
    if (!name)
      name = "Unknown";
    var label = name;
    tag += label;

    var memberCount = getMemberCount(feed);
    var m = document.createElement("span");
    m.className="memberCount";
    m.textContent = memberCount;

    var d = document.createElement("div");
    d.className = "feedListEntry";
    var feedIdentifier = feed.identifier;
    d.setAttribute("data-feed-identifier", feedIdentifier);
    d.style.cursor = "pointer";
    var feedObjId = omlib.store.getObjectId(feed);
    d.onclick = function() {
      var prevSelected = document.getElementsByClassName("feedListSelected");
      if (prevSelected.length > 0) {
        prevSelected[0].className = "feedListEntry";
      }

      d.className += " feedListSelected";
      console.log("feedId: "+feedObjId);
      feedsDb.getObjectById(feedObjId, function(nullObj, db) {
        showFeedInfo(db);
      });
      omlib.longdanMessageConsumer._enqueueFeedForFetch(feedObjId);
      omlib.store.getFeedMessages(feedObjId, showFeedMsgs);
    };

    var img = document.createElement("img");
    img.style['background-image'] = "url('assets/icon.png')";
    d.appendChild(img);

    var text = document.createElement("p");
    text.textContent = label;
    text.appendChild(m);
    d.appendChild(text);

    if (feed.thumbnailHash) {
      omlib.blob.getDownloadLinkForHash(feed.thumbnailHash, function(err, url) {
        if (url)
          img.style['background-image'] = "url('" + url + "')";
      });
    }

    list.appendChild(d);
  });

  // sir haxalot. TODO, use shadow dom?
  if (recentFeeds == tag)
    return;
  recentFeeds = tag;

  var node = document.getElementById('feeds');

  while (node.hasChildNodes()) {
    node.removeChild(node.lastChild);
  }
  node.appendChild(list);
}

var options = {
    //weekday: 'long',
    //month: 'short',
    //year: 'numeric',
    //day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric'
},
intlDate = new Intl.DateTimeFormat( undefined, options );

function showFeedInfo(db) {

  var node = document.getElementById("info");
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }

  var title = document.createElement("div");
  title.className = "infoTitle";
  title.textContent = "Members";
  node.appendChild(title);

  db.members.forEach(function(elem) {

    var p = document.createElement("div");
    p.className = "infoMemberLine";

    var tag = document.createElement("p");
    var icon = document.createElement("div");
    icon.className = "chatIcon";
    icon.style['display'] = "inline-block";
    icon.style['background-image'] = "url('assets/person-icon.png')";
    accountsDb.getObjectById(elem, function(nullObj, account) {
      if (account.thumbnailHash) {
        omlib.blob.getDownloadLinkForHash(account.thumbnailHash, function(err, url) {
          if (url) {
            icon.style['background-image'] = "url('" + url + "')";
          }
        });
      }
      tag.textContent = account.name + " (" + elem + ")";
      tag.className = "infoMember";
    });
    p.appendChild(icon);
    p.appendChild(tag);

    node.appendChild(p);
  });
}

function showFeedMsgs(db) {
  omlib.store.getAccounts(onAccountLoaded);
  while(imgList.length > 0) {
    imgList.pop();
  }

  var messages = db._data.chain().find().simplesort("serverTimestamp", false).data();

  // handle to main container element for scrolling
  var cont = document.getElementById("maincontainer");

  // handle to container element for gallery
  var gallery = document.createElement("div");

  // Clear out messages using DOM from current feed. Should I remove using jquery? (CHECK)
  var node = document.getElementById('main');
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }

  var currentPerson = "";

  messages.forEach(function(msg) {
    // Container element for each chat entry
    var d = document.createElement("div");
    d.className = "chatLine";

    // Create name tag for users other than account owner.
    var nameTag = document.createElement("span");
    nameTag.className = "namePlate";

    // Create icon for the user. Use "div" instead of "img" element because Chrome
    // puts a border around img elements without a src defined.
    var icon = document.createElement("div");
    icon.className = "chatIcon";
    icon.style['background-image'] = "url('assets/person-icon.png')";
    accountsDb.getObjectById(msg.senderId, function(nullObj, account) {
      if (account.thumbnailHash) {
        omlib.blob.getDownloadLinkForHash(account.thumbnailHash, function(err, url) {
          if (url) {
            icon.style['background-image'] = "url('" + url + "')";
          }
        });
      }
      nameTag.textContent = account.name;
    });
    if (currentPerson == msg.senderId) {
      icon.style['background-image'] = "";
      icon.style['border-radius'] = "0";
    }

    // Container element for the chat bubble
    var p = document.createElement("span");
    p.className = "textEntry";

    // TODO: Add some handling for empty messages.
    if (msg.type == "text") {
      p.textContent = msg.text;
    } else if (msg.type == "app") {
      var linkCont = createElementForRdl(msg);
      p.appendChild(linkCont);
    } else if (msg.type == "picture") {
      var picCont = createElementForPicture(msg);
      p.appendChild(picCont);
    } else {
      console.log(msg);
    }

    // TODO: Add the account owner class. Are we sure senderId=1 is always
    // the account owner?
    if (msg.senderId === 1) {
      d.className += " accountOwner";
    } else {
      // Only add image icon if not account owner
      d.appendChild(icon);

      // Only add the nametag if the message sender has changed.
      if (currentPerson != msg.senderId) {
        d.appendChild(nameTag);        
      }
    }
    d.appendChild(p);
    node.appendChild(d);
    currentPerson = msg.senderId;
  })

  // Small timeout to wait until messages are done loading to scroll to the bottom.
  // TODO: Find a more elegant solution.
  setTimeout(function(){
    createImgGallery();
    cont.scrollTop = cont.scrollHeight;
  }, 1000); 
}

function createElementForPicture(picture) {
  var imgHash = picture.fullSizeHash;
  if (!imgHash)
    imgHash = picture.thumbnailHash;
  imgHash = new om.Buffer(imgHash, "base64").toString("hex");

  var imgElem = [];
  var d = document.createElement("a");
  d.className = "linkEntry";
  // Stuff 
  omlib.blob.getDownloadLinkForHash(imgHash, function(err, url) {
    if (url) {
      d.href = url;
      d.setAttribute("data-featherlight", "image");
      console.log(picture);
      imgElem[0] = picture.serverTimestamp;
      imgElem[1] = url;
      return (url);
    }
  });
  d.style.cursor = "pointer";

  var linkThumb = document.createElement("img");
  linkThumb.style['max-width'] = "400px";

  var thumbHash = picture.thumbnailHash;
  if (!thumbHash)
    thumbHash = picture.thumbnailHash;
  thumbHash = new om.Buffer(thumbHash, "base64").toString("hex");
  omlib.blob.getDownloadLinkForHash(thumbHash, function(err, url) {
    if (url) {
      linkThumb.src = url;
      imgElem[2] = url;
      imgList.push(imgElem);
    }
  });

  if (linkThumb.src != undefined) {
    d.appendChild(linkThumb);
  } else {
    var title = document.createElement("div");
    title.className = "linkTitle";
    title.textContent = "Picture";
    d.appendChild(title);
  }
  return d;
}


function createImgGallery() {
  var node = document.getElementById("info");

  var title = document.createElement("div");
  title.className = "infoTitle";
  title.textContent = "Gallery";
  node.appendChild(title);

  imgList = imgList.sort(function(a, b) {
    console.log(a[0]);
    return parseFloat(a[0]) > parseFloat(b[0]);
  });

  console.log("Blah blah");
  for (i = 0; i < imgList.length; i++) {
    var a = document.createElement("a");
    var img = document.createElement("img");
    console.log(imgList[i][0]);
    a.href = imgList[i][1];
    a.setAttribute("data-featherlight", "image");
    img.src = imgList[i][2];
    img.className = "galleryIcon";
    a.appendChild(img);
    node.appendChild(a);
  }
}

function createElementForRdl(link) {
    var d = document.createElement("div");
    d.className = "linkEntry";
    d.onclick = function() {
      var win = window.open(link.webCallback, '_blank');
      win.focus();  
    };
    d.style.cursor = "pointer";

    var linkThumb = document.createElement("img");
    var thumbHash = link.displayThumbnailHash;
    if (!thumbHash)
      thumbHash = link.displayThumbnailHash;
    thumbHash = new om.Buffer(thumbHash, "base64").toString("hex");
    omlib.blob.getDownloadLinkForHash(thumbHash, function(err, url) {
      if (url) {
        linkThumb.src = url;
        linkThumb.style['width'] = "20%";
        linkThumb.style['padding-right'] = "10px";
      }
    });
    d.appendChild(linkThumb);

    var title = document.createElement("div");
    title.className = "linkTitle";
    title.textContent = link.displayTitle;
    d.appendChild(title);
        
    var description = document.createElement("div");
    description.className = "linkDescription";
    description.textContent = link.displayText;
    d.appendChild(description);

    var url = document.createElement("div");
    url.className = "linkUrl";
    url.textContent = link.webCallback;
    d.appendChild(url);

    return d;
}

function showStatus(text, headerText) {
  var header = document.getElementById("header");
  header.style.display = "none";
  header.text = headerText;


  document.getElementById("feeds").style.display = "none";
  var status = document.getElementById("status");
  status.textContent = text;
  status.style.color = "black";
  status.style["font-weight"] = "";
}

function showError(e) {
  document.getElementById("header").style.display = "none";
  document.getElementById("feeds").style.display = "";
  var status = document.getElementById("status");
  status.textContent = "Error sending. " + e;
  status.style.color = "red";
  status.style["font-weight"] = "bold";
}

function finishedSending(feedIdentifier) {
  document.getElementById("header").style.display = "none";
  document.getElementById("feeds").style.display = "none";
  document.getElementById("status").textContent = "Sent.";

  setTimeout(function() {
    window.close();
  }, 1000);
}

var _sending = false;

function findAttribute(node, attr) {
  var val = null;
  while (node !== undefined && val === null) {
    val = node.getAttribute(attr);
    node = node.parentNode;
  }
  return val;
}

function sendUrl(e) {
  if (_sending)
    return;
  _sending = true;

  showStatus("Sending ");

  var feedIdentifier = findAttribute(e.target, "data-feed-identifier");
  var link = getQueryVariable("url");
  var picture = getQueryVariable("picture");
  if (picture) {
    showStatus("Sending " + picture + "...");
    omlib.messaging._imageUrlToObj(picture, _sendObj.bind(this, feedIdentifier, url));
  } else if (link) {
    showStatus("Sending " + link + "...");
    omlib.messaging._urlToObj(link, _sendObj.bind(this, feedIdentifier, link));
  } else {
    getCurrentTabUrl(function(url) {
      showStatus("Sending " + url + "...");
      omlib.messaging._urlToObj(url, _sendObj.bind(this, feedIdentifier, url));
    });
  }
}

function _sendObj(feedIdentifier, url, err, type, body) {
  if (err) {
    omlib.messaging._sendObj(feedIdentifier, "text", {
      text: url
    }, function(err, resp, req) {
      _sending = false;
      if (err) {
        showError(err);
      } else {
        finishedSending(feedIdentifier);
      }
    });
  } else {
    omlib.messaging._sendObj(feedIdentifier, type, body, function(err, resp, req) {
      _sending = false;
      if (err) {
        showError(err);
      } else {
        finishedSending(feedIdentifier);
      }
    });
  }
}

function getMemberCount(feed) {
  return feed.members.length;
}

function getMemberCount(feed) {
  return feed.members.length;
}

function signin() {
  var email = prompt("Hey, what's your email?")
  showStatus("Signing in " + email + "...");
  omlib.auth.connectEmail(email);
}

function onSignedIn() {
  showStatus("Welcome!");
  showRecents();
}

function onFeedsUpdated(o) {
  showRecents();
}

function onFeedsLoaded(f) {
  feedsDb = f;
  console.log(f);
}

function onAccountLoaded(f) {
  accountsDb = f;
  console.log(f);
}

function getQueryVariable(variable) {
  var query = window.location.search.substring(1);
  var vars = query.split('&');
  for (var i = 0; i < vars.length; i++) {
    var pair = vars[i].split('=');
    if (decodeURIComponent(pair[0]) == variable) {
      return decodeURIComponent(pair[1]);
    }
  }
  return null;
}


function initOmlib() {
    om = require('omclient');
    omlib = new om.client.Client();

    omlib.events.registerMessagePushReceiver(onMessagePushed);
}

initOmlib();
omlib.enable();

window.addEventListener("load", function load(event){

  omlib.store.getFeeds(onFeedsLoaded);
  omlib.events.register(omlib.events.FEEDS, onFeedsUpdated);
  omlib.store.getAccounts(onAccountLoaded);

  if (!omlib.account) {
      signin();
  } else {
    omlib.identity.refreshAccountProfile(omlib.account);
    showRecents();
  }
}, false);


