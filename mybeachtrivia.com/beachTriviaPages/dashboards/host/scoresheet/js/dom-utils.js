/* dom-utils.js
   Simple DOM helpers + small utilities used across the scoresheet.
   Classic script style (no imports). Everything is exposed on window.DomUtils.
*/
(function () {
    "use strict";
  
    function $(selector, root) {
      return (root || document).querySelector(selector);
    }
  
    function $all(selector, root) {
      return Array.from((root || document).querySelectorAll(selector));
    }
  
    function debounce(fn, waitMs) {
      let t = null;
      return function debounced(...args) {
        if (t) clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), waitMs);
      };
    }
  
    // Expose as a namespaced object to avoid global collisions
    window.DomUtils = {
      $,
      $all,
      debounce,
    };
  })();