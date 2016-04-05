(function() {
  // common tools //////////////////////////////////////////////////
  var LIB = {};
  LIB.changeListener = function() {
    var listeners = [];
    var addListener = function(o) {
      if (typeof o !== 'function') {
        throw new Error('argument is not a function');
      }
      if (listeners.indexOf(o) === -1) {
        listeners.push(o);
      }
    };
    var deleteListener = function(o) {
      var index = listeners.indexOf(o);
      if (index > -1) {
        listeners.splice(index, 1);
      } else {
        throw new Error('no such listener found');
      }
    };
    var invokeListeners = function() {
      var i, l,
        listenersCopy = listeners.slice(0);
      for (i = 0, l = listenersCopy.length; i < l; i++) {
        listenersCopy[i].apply(listenersCopy[i], arguments);
      }
    };
    return {
      addListener: addListener,
      deleteListener: deleteListener,
      invokeListeners: invokeListeners
    };
  };

  LIB.elementsObj = function(selector, rootElement) {
    rootElement = rootElement || document;
    var result = {},
      elements = rootElement.querySelectorAll('[' + selector + ']'),
      element, node;
    for (element in elements) {
      node = elements[element];
      if (node.nodeType == 1) {
        result[node.getAttribute(selector)] = node;
      }
    }
    return result;
  };

  LIB.onLoad = function(callback) {
    if (document.addEventListener) {
      document.addEventListener("DOMContentLoaded", function() {
        document.removeEventListener("DOMContentLoaded", callback, false);
        callback();
      }, false);
    } else if (document.attachEvent) {
      document.attachEvent("onreadystatechange", function() {
        if (document.readyState === "complete") {
          document.detachEvent("onreadystatechange", callback);
          callback();
        }
      });
    }
  };

  // Model class //////////////////////////////////////////////////
  LIB.Model = function() {
    var saveData,
      savedID, timeoutID;
    this.id = 0;
    this.data = {};
    this.modelOnLoadListener = LIB.changeListener();
    if (typeof(Storage) !== undefined) {
      try {
        saveData = localStorage.getItem('LIB_data');
        savedID = localStorage.getItem('LIB_id');
        if (savedID !== null && saveData !== null) {
          this.data = JSON.parse(saveData);
          this.id = Number(savedID);
          timeoutID = setTimeout(function() {
            if (view) {
              this.modelOnLoadListener.invokeListeners(this.data);
              clearTimeout(timeoutID);
            }
          }.bind(this), 100);
        }
      } catch (e) {
        console.log(e);
      }
    }
    this.metadata = {
      author: {
        type: 'string',
        maxlength: 40,
        required: true
      },
      name: {
        type: 'string',
        maxlength: 60,
        required: true
      },
      year: {
        type: 'number',
        range: [0, 3000],
        required: false
      },
      pages: {
        type: 'number',
        range: [0, 10000],
        required: false
      }
    };
  };

  LIB.Model.prototype.save = function() {
    if (typeof(Storage) !== undefined) {
      localStorage.setItem("LIB_data", JSON.stringify(this.data));
      localStorage.setItem("LIB_id", JSON.stringify(this.id));
    }
  };

  LIB.Model.prototype.get = function(id) {
    var data = this.data[id];
    data.id = id;
    return data;
  };

  LIB.Model.prototype.modelOnAddListener = LIB.changeListener();

  LIB.Model.prototype.modelOnEditListener = LIB.changeListener();

  LIB.Model.prototype.add = function(data) {
    var isValid = this.validate(data);
    if (isValid.length === 0) {
      if (data.id === '' || data.id === undefined) {
        this.data[++this.id] = data;
        this.modelOnAddListener.invokeListeners(data, this.id);
      } else {
        this.data[data.id] = data;
        this.modelOnEditListener.invokeListeners(data, data.id);
      }
      this.save();
    } else {
      return isValid;
    }
  };

  LIB.Model.prototype.modelOnRemoveListener = LIB.changeListener();

  LIB.Model.prototype.remove = function(id) {
    if (id in this.data) {
      delete this.data[id];
      this.modelOnRemoveListener.invokeListeners(id);
      this.save();
    } else {
      console.log('Unsuccessful delete. No such ID in model: ', id);
    }
  };

  LIB.Model.prototype.validate = function(data) {
    var invalidFields = [],
      key, check;
    for (key in data) {
      for (check in this.metadata[key]) {
        switch (check) {
          case 'type':
            if (typeof data[key] !== this.metadata[key][check] ||
              Number.isNaN(data[key])) {
              invalidFields.push({
                field: key,
                post: 'Неправильный тип данных в поле ' + key + '. Ожидается: ' + this.metadata[key][check]
              });
            }
            break;
          case 'maxlength':
            if (data[key].length > this.metadata[key][check]) {
              invalidFields.push({
                field: key,
                post: 'Длина поля ' + key + ' не должна превышать ' + this.metadata[key][check] + ' символов.'
              });
            }
            break;
          case 'required':
            if (!data[key] && this.metadata[key][check]) {
              invalidFields.push({
                field: key,
                post: 'Поле ' + key + ' обязательно для заполнения.'
              });
            }
            break;
          case 'range':
            if (data[key] < this.metadata[key][check][0] ||
              data[key] > this.metadata[key][check][1]) {
              invalidFields.push({
                field: key,
                post: 'Значение поля ' + key + ' выглядит неправдоподобно.'
              });
            }
            break;
          default:
            break;
        }
      }
    }
    return invalidFields;
  };

  // View class //////////////////////////////////////////////////
  LIB.View = function(model) {
    this.rootElement = document.querySelector('[lib-app]');
    this.repeatObj = new LIB.View.Template(this.rootElement.querySelector('[lib-repeat]'));
    this.warningElement = this.rootElement.querySelector('[lib-warning-panel]');
    this.warningMsg = this.rootElement.querySelector('[lib-warning-text]');
    this.formElement = this.rootElement.getElementsByTagName('form')[0];
    this.formObj = LIB.elementsObj('lib-content', this.formElement);
    this.formCtls = LIB.elementsObj('lib-action', this.formElement);

    //listeners for model
    model.modelOnAddListener.addListener(this.addItem.bind(this));
    model.modelOnRemoveListener.addListener(this.removeItem.bind(this));
    model.modelOnEditListener.addListener(this.editItem.bind(this));
    model.modelOnLoadListener.addListener(this.addItems.bind(this));
  };

  LIB.View.Template = function(passedElement) {
    this.parentElement = passedElement.parentNode;
    this.repeatTemplate = this.parentElement.removeChild(passedElement);
    this.modelQueries = LIB.elementsObj('lib-model', this.repeatTemplate);
    this.controllerActions = LIB.elementsObj('lib-action', this.repeatTemplate);
  };

  LIB.View.prototype.makeItem = function(data, id) {
    var inst,
      element;
    for (inst in this.repeatObj.modelQueries) {
      element = this.repeatObj.modelQueries[inst];
      element.textContent = data[inst] || '';
    }
    for (inst in this.repeatObj.controllerActions) {
      element = this.repeatObj.controllerActions[inst];
      element.setAttribute('lib-id', id);
    }
    this.repeatObj.repeatTemplate.setAttribute('lib-repeat', id);
    return this.repeatObj.repeatTemplate.cloneNode(true);
  };

  LIB.View.prototype.addItem = function(data, id) {
    var child = this.makeItem(data, id);
    this.repeatObj.parentElement.appendChild(child);
  };

  LIB.View.prototype.highLight = (function() {
    var prevID;
    return function(id) {
      if (prevID) {
        this.unHighLight(prevID);
      }
      if (id) {
        var element = this.repeatObj.parentElement.querySelector('[lib-repeat="' + id + '"]');
        element.className += ' info';
        prevID = id;
      } else {
        prevID = false;
      }
    };
  })();

  LIB.View.prototype.unHighLight = function(id) {
    var element = this.repeatObj.parentElement.querySelector('[lib-repeat="' + id + '"]');
    if (element) {
      element.className = element.className.replace(' info', '');
    }
  };

  LIB.View.prototype.addItems = function(data) {
    var container = document.createDocumentFragment(),
      id, child;
    for (id in data) {
      child = this.makeItem(data[id], id);
      container.appendChild(child);
    }
    this.repeatObj.parentElement.appendChild(container);
  };

  LIB.View.prototype.removeItem = function(id) {
    var child = this.repeatObj.parentElement.querySelector('[lib-repeat="' + id + '"]');
    if (child) {
      this.repeatObj.parentElement.removeChild(child);
    }
  };

  LIB.View.prototype.editItem = function(data, id) {
    var child = this.repeatObj.parentElement.querySelector('[lib-repeat="' + id + '"]'),
      newChild = this.makeItem(data, id);
    if (child) {
      this.repeatObj.parentElement.replaceChild(newChild, child);
    } else {
      this.addItem(data, id);
    }
    this.unHighLight(id);
  };

  LIB.View.prototype.showWarning = function(errors) {
    var o, l, line, text, msg,
      list = document.createElement('ul');
    for (i = 0, l = errors.length; i < l; i++) {
      line = document.createElement('li');
      text = document.createTextNode(errors[i].post);
      line.appendChild(text);
      list.appendChild(line);
    }
    this.warningElement.style.display = 'block';
    this.warningMsg.appendChild(list);
    console.log(errors);
  };

  LIB.View.prototype.hideWarning = function() {
    while (this.warningMsg.firstChild) {
      this.warningMsg.removeChild(this.warningMsg.firstChild);
    }
    this.warningElement.style.display = 'none';
  };

  // Controller class //////////////////////////////////////////////////
  LIB.Controller = function(model, view) {
    view.formCtls.submit.addEventListener('click', function(event) {
      event.preventDefault();
      view.hideWarning();
      var data = {},
        inst, errors, value;
      for (inst in view.formObj) {
        value = view.formObj[inst].value;
        type = view.formObj[inst].getAttribute('lib-content-type');
        if (type === 'number') {
          value = Number(value);
        }
        data[inst] = value;
      }
      errors = model.add(data);
      if (errors) {
        view.showWarning(errors);
        return;
      }
      view.hideWarning();
      view.formElement.reset();
    }, false);

    view.formCtls.reset.addEventListener('click', function(event) {
      view.hideWarning();
      view.highLight();
    }, false);

    view.repeatObj.parentElement.addEventListener('click', function(event) {
      var element = event.target,
        action, id, data, inst;
      if (element.hasAttribute('lib-action')) {
        action = element.getAttribute('lib-action');
        id = element.getAttribute('lib-id');
        if (action === 'delete') {
          model.remove(id);
          return;
        }
        if (action === 'edit') {
          view.highLight(id);
          data = model.get(id);
          for (inst in view.formObj) {
            view.formObj[inst].value = data[inst];
          }
          return;
        }
      }
    }, false);
  };

  // run //////////////////////////////////////////////////
  var model, view, controller;
  LIB.onLoad(function() {
    model = new LIB.Model();
    view = new LIB.View(model);
    controller = new LIB.Controller(model, view);
  });
})();