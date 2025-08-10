"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
exports.id = "vendor-chunks/uint8arrays";
exports.ids = ["vendor-chunks/uint8arrays"];
exports.modules = {

/***/ "(ssr)/./node_modules/uint8arrays/cjs/src/compare.js":
/*!*****************************************************!*\
  !*** ./node_modules/uint8arrays/cjs/src/compare.js ***!
  \*****************************************************/
/***/ ((__unused_webpack_module, exports) => {

eval("\n\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\n\nfunction compare(a, b) {\n  for (let i = 0; i < a.byteLength; i++) {\n    if (a[i] < b[i]) {\n      return -1;\n    }\n    if (a[i] > b[i]) {\n      return 1;\n    }\n  }\n  if (a.byteLength > b.byteLength) {\n    return 1;\n  }\n  if (a.byteLength < b.byteLength) {\n    return -1;\n  }\n  return 0;\n}\n\nexports.compare = compare;\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHNzcikvLi9ub2RlX21vZHVsZXMvdWludDhhcnJheXMvY2pzL3NyYy9jb21wYXJlLmpzIiwibWFwcGluZ3MiOiJBQUFhOztBQUViLDhDQUE2QyxFQUFFLGFBQWEsRUFBQzs7QUFFN0Q7QUFDQSxrQkFBa0Isa0JBQWtCO0FBQ3BDO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQSxlQUFlIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vcGVhY2Utem9uZS13ZWIvLi9ub2RlX21vZHVsZXMvdWludDhhcnJheXMvY2pzL3NyYy9jb21wYXJlLmpzPzc2YjQiXSwic291cmNlc0NvbnRlbnQiOlsiJ3VzZSBzdHJpY3QnO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgJ19fZXNNb2R1bGUnLCB7IHZhbHVlOiB0cnVlIH0pO1xuXG5mdW5jdGlvbiBjb21wYXJlKGEsIGIpIHtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBhLmJ5dGVMZW5ndGg7IGkrKykge1xuICAgIGlmIChhW2ldIDwgYltpXSkge1xuICAgICAgcmV0dXJuIC0xO1xuICAgIH1cbiAgICBpZiAoYVtpXSA+IGJbaV0pIHtcbiAgICAgIHJldHVybiAxO1xuICAgIH1cbiAgfVxuICBpZiAoYS5ieXRlTGVuZ3RoID4gYi5ieXRlTGVuZ3RoKSB7XG4gICAgcmV0dXJuIDE7XG4gIH1cbiAgaWYgKGEuYnl0ZUxlbmd0aCA8IGIuYnl0ZUxlbmd0aCkge1xuICAgIHJldHVybiAtMTtcbiAgfVxuICByZXR1cm4gMDtcbn1cblxuZXhwb3J0cy5jb21wYXJlID0gY29tcGFyZTtcbiJdLCJuYW1lcyI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(ssr)/./node_modules/uint8arrays/cjs/src/compare.js\n");

/***/ }),

/***/ "(ssr)/./node_modules/uint8arrays/cjs/src/concat.js":
/*!****************************************************!*\
  !*** ./node_modules/uint8arrays/cjs/src/concat.js ***!
  \****************************************************/
/***/ ((__unused_webpack_module, exports) => {

eval("\n\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\n\nfunction concat(arrays, length) {\n  if (!length) {\n    length = arrays.reduce((acc, curr) => acc + curr.length, 0);\n  }\n  const output = new Uint8Array(length);\n  let offset = 0;\n  for (const arr of arrays) {\n    output.set(arr, offset);\n    offset += arr.length;\n  }\n  return output;\n}\n\nexports.concat = concat;\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHNzcikvLi9ub2RlX21vZHVsZXMvdWludDhhcnJheXMvY2pzL3NyYy9jb25jYXQuanMiLCJtYXBwaW5ncyI6IkFBQWE7O0FBRWIsOENBQTZDLEVBQUUsYUFBYSxFQUFDOztBQUU3RDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUEsY0FBYyIsInNvdXJjZXMiOlsid2VicGFjazovL3BlYWNlLXpvbmUtd2ViLy4vbm9kZV9tb2R1bGVzL3VpbnQ4YXJyYXlzL2Nqcy9zcmMvY29uY2F0LmpzP2ExMTMiXSwic291cmNlc0NvbnRlbnQiOlsiJ3VzZSBzdHJpY3QnO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgJ19fZXNNb2R1bGUnLCB7IHZhbHVlOiB0cnVlIH0pO1xuXG5mdW5jdGlvbiBjb25jYXQoYXJyYXlzLCBsZW5ndGgpIHtcbiAgaWYgKCFsZW5ndGgpIHtcbiAgICBsZW5ndGggPSBhcnJheXMucmVkdWNlKChhY2MsIGN1cnIpID0+IGFjYyArIGN1cnIubGVuZ3RoLCAwKTtcbiAgfVxuICBjb25zdCBvdXRwdXQgPSBuZXcgVWludDhBcnJheShsZW5ndGgpO1xuICBsZXQgb2Zmc2V0ID0gMDtcbiAgZm9yIChjb25zdCBhcnIgb2YgYXJyYXlzKSB7XG4gICAgb3V0cHV0LnNldChhcnIsIG9mZnNldCk7XG4gICAgb2Zmc2V0ICs9IGFyci5sZW5ndGg7XG4gIH1cbiAgcmV0dXJuIG91dHB1dDtcbn1cblxuZXhwb3J0cy5jb25jYXQgPSBjb25jYXQ7XG4iXSwibmFtZXMiOltdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(ssr)/./node_modules/uint8arrays/cjs/src/concat.js\n");

/***/ }),

/***/ "(ssr)/./node_modules/uint8arrays/cjs/src/equals.js":
/*!****************************************************!*\
  !*** ./node_modules/uint8arrays/cjs/src/equals.js ***!
  \****************************************************/
/***/ ((__unused_webpack_module, exports) => {

eval("\n\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\n\nfunction equals(a, b) {\n  if (a === b) {\n    return true;\n  }\n  if (a.byteLength !== b.byteLength) {\n    return false;\n  }\n  for (let i = 0; i < a.byteLength; i++) {\n    if (a[i] !== b[i]) {\n      return false;\n    }\n  }\n  return true;\n}\n\nexports.equals = equals;\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHNzcikvLi9ub2RlX21vZHVsZXMvdWludDhhcnJheXMvY2pzL3NyYy9lcXVhbHMuanMiLCJtYXBwaW5ncyI6IkFBQWE7O0FBRWIsOENBQTZDLEVBQUUsYUFBYSxFQUFDOztBQUU3RDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLGtCQUFrQixrQkFBa0I7QUFDcEM7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBLGNBQWMiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9wZWFjZS16b25lLXdlYi8uL25vZGVfbW9kdWxlcy91aW50OGFycmF5cy9janMvc3JjL2VxdWFscy5qcz82N2EwIl0sInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0JztcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsICdfX2VzTW9kdWxlJywgeyB2YWx1ZTogdHJ1ZSB9KTtcblxuZnVuY3Rpb24gZXF1YWxzKGEsIGIpIHtcbiAgaWYgKGEgPT09IGIpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuICBpZiAoYS5ieXRlTGVuZ3RoICE9PSBiLmJ5dGVMZW5ndGgpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBhLmJ5dGVMZW5ndGg7IGkrKykge1xuICAgIGlmIChhW2ldICE9PSBiW2ldKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG4gIHJldHVybiB0cnVlO1xufVxuXG5leHBvcnRzLmVxdWFscyA9IGVxdWFscztcbiJdLCJuYW1lcyI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(ssr)/./node_modules/uint8arrays/cjs/src/equals.js\n");

/***/ }),

/***/ "(ssr)/./node_modules/uint8arrays/cjs/src/from-string.js":
/*!*********************************************************!*\
  !*** ./node_modules/uint8arrays/cjs/src/from-string.js ***!
  \*********************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

eval("\n\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\n\nvar bases = __webpack_require__(/*! ./util/bases.js */ \"(ssr)/./node_modules/uint8arrays/cjs/src/util/bases.js\");\n\nfunction fromString(string, encoding = 'utf8') {\n  const base = bases[encoding];\n  if (!base) {\n    throw new Error(`Unsupported encoding \"${ encoding }\"`);\n  }\n  return base.decoder.decode(`${ base.prefix }${ string }`);\n}\n\nexports.fromString = fromString;\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHNzcikvLi9ub2RlX21vZHVsZXMvdWludDhhcnJheXMvY2pzL3NyYy9mcm9tLXN0cmluZy5qcyIsIm1hcHBpbmdzIjoiQUFBYTs7QUFFYiw4Q0FBNkMsRUFBRSxhQUFhLEVBQUM7O0FBRTdELFlBQVksbUJBQU8sQ0FBQywrRUFBaUI7O0FBRXJDO0FBQ0E7QUFDQTtBQUNBLDhDQUE4QyxVQUFVO0FBQ3hEO0FBQ0EsaUNBQWlDLGFBQWEsR0FBRyxRQUFRO0FBQ3pEOztBQUVBLGtCQUFrQiIsInNvdXJjZXMiOlsid2VicGFjazovL3BlYWNlLXpvbmUtd2ViLy4vbm9kZV9tb2R1bGVzL3VpbnQ4YXJyYXlzL2Nqcy9zcmMvZnJvbS1zdHJpbmcuanM/NThiMCJdLCJzb3VyY2VzQ29udGVudCI6WyIndXNlIHN0cmljdCc7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCAnX19lc01vZHVsZScsIHsgdmFsdWU6IHRydWUgfSk7XG5cbnZhciBiYXNlcyA9IHJlcXVpcmUoJy4vdXRpbC9iYXNlcy5qcycpO1xuXG5mdW5jdGlvbiBmcm9tU3RyaW5nKHN0cmluZywgZW5jb2RpbmcgPSAndXRmOCcpIHtcbiAgY29uc3QgYmFzZSA9IGJhc2VzW2VuY29kaW5nXTtcbiAgaWYgKCFiYXNlKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBVbnN1cHBvcnRlZCBlbmNvZGluZyBcIiR7IGVuY29kaW5nIH1cImApO1xuICB9XG4gIHJldHVybiBiYXNlLmRlY29kZXIuZGVjb2RlKGAkeyBiYXNlLnByZWZpeCB9JHsgc3RyaW5nIH1gKTtcbn1cblxuZXhwb3J0cy5mcm9tU3RyaW5nID0gZnJvbVN0cmluZztcbiJdLCJuYW1lcyI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(ssr)/./node_modules/uint8arrays/cjs/src/from-string.js\n");

/***/ }),

/***/ "(ssr)/./node_modules/uint8arrays/cjs/src/index.js":
/*!***************************************************!*\
  !*** ./node_modules/uint8arrays/cjs/src/index.js ***!
  \***************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

eval("\n\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\n\nvar compare = __webpack_require__(/*! ./compare.js */ \"(ssr)/./node_modules/uint8arrays/cjs/src/compare.js\");\nvar concat = __webpack_require__(/*! ./concat.js */ \"(ssr)/./node_modules/uint8arrays/cjs/src/concat.js\");\nvar equals = __webpack_require__(/*! ./equals.js */ \"(ssr)/./node_modules/uint8arrays/cjs/src/equals.js\");\nvar fromString = __webpack_require__(/*! ./from-string.js */ \"(ssr)/./node_modules/uint8arrays/cjs/src/from-string.js\");\nvar toString = __webpack_require__(/*! ./to-string.js */ \"(ssr)/./node_modules/uint8arrays/cjs/src/to-string.js\");\nvar xor = __webpack_require__(/*! ./xor.js */ \"(ssr)/./node_modules/uint8arrays/cjs/src/xor.js\");\n\n\n\nexports.compare = compare.compare;\nexports.concat = concat.concat;\nexports.equals = equals.equals;\nexports.fromString = fromString.fromString;\nexports.toString = toString.toString;\nexports.xor = xor.xor;\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHNzcikvLi9ub2RlX21vZHVsZXMvdWludDhhcnJheXMvY2pzL3NyYy9pbmRleC5qcyIsIm1hcHBpbmdzIjoiQUFBYTs7QUFFYiw4Q0FBNkMsRUFBRSxhQUFhLEVBQUM7O0FBRTdELGNBQWMsbUJBQU8sQ0FBQyx5RUFBYztBQUNwQyxhQUFhLG1CQUFPLENBQUMsdUVBQWE7QUFDbEMsYUFBYSxtQkFBTyxDQUFDLHVFQUFhO0FBQ2xDLGlCQUFpQixtQkFBTyxDQUFDLGlGQUFrQjtBQUMzQyxlQUFlLG1CQUFPLENBQUMsNkVBQWdCO0FBQ3ZDLFVBQVUsbUJBQU8sQ0FBQyxpRUFBVTs7OztBQUk1QixlQUFlO0FBQ2YsY0FBYztBQUNkLGNBQWM7QUFDZCxrQkFBa0I7QUFDbEIsZ0JBQWdCO0FBQ2hCLFdBQVciLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9wZWFjZS16b25lLXdlYi8uL25vZGVfbW9kdWxlcy91aW50OGFycmF5cy9janMvc3JjL2luZGV4LmpzPzBhMjciXSwic291cmNlc0NvbnRlbnQiOlsiJ3VzZSBzdHJpY3QnO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgJ19fZXNNb2R1bGUnLCB7IHZhbHVlOiB0cnVlIH0pO1xuXG52YXIgY29tcGFyZSA9IHJlcXVpcmUoJy4vY29tcGFyZS5qcycpO1xudmFyIGNvbmNhdCA9IHJlcXVpcmUoJy4vY29uY2F0LmpzJyk7XG52YXIgZXF1YWxzID0gcmVxdWlyZSgnLi9lcXVhbHMuanMnKTtcbnZhciBmcm9tU3RyaW5nID0gcmVxdWlyZSgnLi9mcm9tLXN0cmluZy5qcycpO1xudmFyIHRvU3RyaW5nID0gcmVxdWlyZSgnLi90by1zdHJpbmcuanMnKTtcbnZhciB4b3IgPSByZXF1aXJlKCcuL3hvci5qcycpO1xuXG5cblxuZXhwb3J0cy5jb21wYXJlID0gY29tcGFyZS5jb21wYXJlO1xuZXhwb3J0cy5jb25jYXQgPSBjb25jYXQuY29uY2F0O1xuZXhwb3J0cy5lcXVhbHMgPSBlcXVhbHMuZXF1YWxzO1xuZXhwb3J0cy5mcm9tU3RyaW5nID0gZnJvbVN0cmluZy5mcm9tU3RyaW5nO1xuZXhwb3J0cy50b1N0cmluZyA9IHRvU3RyaW5nLnRvU3RyaW5nO1xuZXhwb3J0cy54b3IgPSB4b3IueG9yO1xuIl0sIm5hbWVzIjpbXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(ssr)/./node_modules/uint8arrays/cjs/src/index.js\n");

/***/ }),

/***/ "(ssr)/./node_modules/uint8arrays/cjs/src/to-string.js":
/*!*******************************************************!*\
  !*** ./node_modules/uint8arrays/cjs/src/to-string.js ***!
  \*******************************************************/
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

eval("\n\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\n\nvar bases = __webpack_require__(/*! ./util/bases.js */ \"(ssr)/./node_modules/uint8arrays/cjs/src/util/bases.js\");\n\nfunction toString(array, encoding = 'utf8') {\n  const base = bases[encoding];\n  if (!base) {\n    throw new Error(`Unsupported encoding \"${ encoding }\"`);\n  }\n  return base.encoder.encode(array).substring(1);\n}\n\nexports.toString = toString;\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHNzcikvLi9ub2RlX21vZHVsZXMvdWludDhhcnJheXMvY2pzL3NyYy90by1zdHJpbmcuanMiLCJtYXBwaW5ncyI6IkFBQWE7O0FBRWIsOENBQTZDLEVBQUUsYUFBYSxFQUFDOztBQUU3RCxZQUFZLG1CQUFPLENBQUMsK0VBQWlCOztBQUVyQztBQUNBO0FBQ0E7QUFDQSw4Q0FBOEMsVUFBVTtBQUN4RDtBQUNBO0FBQ0E7O0FBRUEsZ0JBQWdCIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vcGVhY2Utem9uZS13ZWIvLi9ub2RlX21vZHVsZXMvdWludDhhcnJheXMvY2pzL3NyYy90by1zdHJpbmcuanM/N2ZhOSJdLCJzb3VyY2VzQ29udGVudCI6WyIndXNlIHN0cmljdCc7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCAnX19lc01vZHVsZScsIHsgdmFsdWU6IHRydWUgfSk7XG5cbnZhciBiYXNlcyA9IHJlcXVpcmUoJy4vdXRpbC9iYXNlcy5qcycpO1xuXG5mdW5jdGlvbiB0b1N0cmluZyhhcnJheSwgZW5jb2RpbmcgPSAndXRmOCcpIHtcbiAgY29uc3QgYmFzZSA9IGJhc2VzW2VuY29kaW5nXTtcbiAgaWYgKCFiYXNlKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBVbnN1cHBvcnRlZCBlbmNvZGluZyBcIiR7IGVuY29kaW5nIH1cImApO1xuICB9XG4gIHJldHVybiBiYXNlLmVuY29kZXIuZW5jb2RlKGFycmF5KS5zdWJzdHJpbmcoMSk7XG59XG5cbmV4cG9ydHMudG9TdHJpbmcgPSB0b1N0cmluZztcbiJdLCJuYW1lcyI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(ssr)/./node_modules/uint8arrays/cjs/src/to-string.js\n");

/***/ }),

/***/ "(ssr)/./node_modules/uint8arrays/cjs/src/util/bases.js":
/*!********************************************************!*\
  !*** ./node_modules/uint8arrays/cjs/src/util/bases.js ***!
  \********************************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

eval("\n\nvar basics = __webpack_require__(/*! multiformats/basics */ \"(ssr)/./node_modules/multiformats/cjs/src/basics.js\");\n\nfunction createCodec(name, prefix, encode, decode) {\n  return {\n    name,\n    prefix,\n    encoder: {\n      name,\n      prefix,\n      encode\n    },\n    decoder: { decode }\n  };\n}\nconst string = createCodec('utf8', 'u', buf => {\n  const decoder = new TextDecoder('utf8');\n  return 'u' + decoder.decode(buf);\n}, str => {\n  const encoder = new TextEncoder();\n  return encoder.encode(str.substring(1));\n});\nconst ascii = createCodec('ascii', 'a', buf => {\n  let string = 'a';\n  for (let i = 0; i < buf.length; i++) {\n    string += String.fromCharCode(buf[i]);\n  }\n  return string;\n}, str => {\n  str = str.substring(1);\n  const buf = new Uint8Array(str.length);\n  for (let i = 0; i < str.length; i++) {\n    buf[i] = str.charCodeAt(i);\n  }\n  return buf;\n});\nconst BASES = {\n  utf8: string,\n  'utf-8': string,\n  hex: basics.bases.base16,\n  latin1: ascii,\n  ascii: ascii,\n  binary: ascii,\n  ...basics.bases\n};\n\nmodule.exports = BASES;\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHNzcikvLi9ub2RlX21vZHVsZXMvdWludDhhcnJheXMvY2pzL3NyYy91dGlsL2Jhc2VzLmpzIiwibWFwcGluZ3MiOiJBQUFhOztBQUViLGFBQWEsbUJBQU8sQ0FBQyxnRkFBcUI7O0FBRTFDO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxLQUFLO0FBQ0wsZUFBZTtBQUNmO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxDQUFDO0FBQ0Q7QUFDQTtBQUNBLENBQUM7QUFDRDtBQUNBO0FBQ0Esa0JBQWtCLGdCQUFnQjtBQUNsQztBQUNBO0FBQ0E7QUFDQSxDQUFDO0FBQ0Q7QUFDQTtBQUNBLGtCQUFrQixnQkFBZ0I7QUFDbEM7QUFDQTtBQUNBO0FBQ0EsQ0FBQztBQUNEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQSIsInNvdXJjZXMiOlsid2VicGFjazovL3BlYWNlLXpvbmUtd2ViLy4vbm9kZV9tb2R1bGVzL3VpbnQ4YXJyYXlzL2Nqcy9zcmMvdXRpbC9iYXNlcy5qcz82M2VmIl0sInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0JztcblxudmFyIGJhc2ljcyA9IHJlcXVpcmUoJ211bHRpZm9ybWF0cy9iYXNpY3MnKTtcblxuZnVuY3Rpb24gY3JlYXRlQ29kZWMobmFtZSwgcHJlZml4LCBlbmNvZGUsIGRlY29kZSkge1xuICByZXR1cm4ge1xuICAgIG5hbWUsXG4gICAgcHJlZml4LFxuICAgIGVuY29kZXI6IHtcbiAgICAgIG5hbWUsXG4gICAgICBwcmVmaXgsXG4gICAgICBlbmNvZGVcbiAgICB9LFxuICAgIGRlY29kZXI6IHsgZGVjb2RlIH1cbiAgfTtcbn1cbmNvbnN0IHN0cmluZyA9IGNyZWF0ZUNvZGVjKCd1dGY4JywgJ3UnLCBidWYgPT4ge1xuICBjb25zdCBkZWNvZGVyID0gbmV3IFRleHREZWNvZGVyKCd1dGY4Jyk7XG4gIHJldHVybiAndScgKyBkZWNvZGVyLmRlY29kZShidWYpO1xufSwgc3RyID0+IHtcbiAgY29uc3QgZW5jb2RlciA9IG5ldyBUZXh0RW5jb2RlcigpO1xuICByZXR1cm4gZW5jb2Rlci5lbmNvZGUoc3RyLnN1YnN0cmluZygxKSk7XG59KTtcbmNvbnN0IGFzY2lpID0gY3JlYXRlQ29kZWMoJ2FzY2lpJywgJ2EnLCBidWYgPT4ge1xuICBsZXQgc3RyaW5nID0gJ2EnO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGJ1Zi5sZW5ndGg7IGkrKykge1xuICAgIHN0cmluZyArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ1ZltpXSk7XG4gIH1cbiAgcmV0dXJuIHN0cmluZztcbn0sIHN0ciA9PiB7XG4gIHN0ciA9IHN0ci5zdWJzdHJpbmcoMSk7XG4gIGNvbnN0IGJ1ZiA9IG5ldyBVaW50OEFycmF5KHN0ci5sZW5ndGgpO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xuICAgIGJ1ZltpXSA9IHN0ci5jaGFyQ29kZUF0KGkpO1xuICB9XG4gIHJldHVybiBidWY7XG59KTtcbmNvbnN0IEJBU0VTID0ge1xuICB1dGY4OiBzdHJpbmcsXG4gICd1dGYtOCc6IHN0cmluZyxcbiAgaGV4OiBiYXNpY3MuYmFzZXMuYmFzZTE2LFxuICBsYXRpbjE6IGFzY2lpLFxuICBhc2NpaTogYXNjaWksXG4gIGJpbmFyeTogYXNjaWksXG4gIC4uLmJhc2ljcy5iYXNlc1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBCQVNFUztcbiJdLCJuYW1lcyI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(ssr)/./node_modules/uint8arrays/cjs/src/util/bases.js\n");

/***/ }),

/***/ "(ssr)/./node_modules/uint8arrays/cjs/src/xor.js":
/*!*************************************************!*\
  !*** ./node_modules/uint8arrays/cjs/src/xor.js ***!
  \*************************************************/
/***/ ((__unused_webpack_module, exports) => {

eval("\n\nObject.defineProperty(exports, \"__esModule\", ({ value: true }));\n\nfunction xor(a, b) {\n  if (a.length !== b.length) {\n    throw new Error('Inputs should have the same length');\n  }\n  const result = new Uint8Array(a.length);\n  for (let i = 0; i < a.length; i++) {\n    result[i] = a[i] ^ b[i];\n  }\n  return result;\n}\n\nexports.xor = xor;\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHNzcikvLi9ub2RlX21vZHVsZXMvdWludDhhcnJheXMvY2pzL3NyYy94b3IuanMiLCJtYXBwaW5ncyI6IkFBQWE7O0FBRWIsOENBQTZDLEVBQUUsYUFBYSxFQUFDOztBQUU3RDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0Esa0JBQWtCLGNBQWM7QUFDaEM7QUFDQTtBQUNBO0FBQ0E7O0FBRUEsV0FBVyIsInNvdXJjZXMiOlsid2VicGFjazovL3BlYWNlLXpvbmUtd2ViLy4vbm9kZV9tb2R1bGVzL3VpbnQ4YXJyYXlzL2Nqcy9zcmMveG9yLmpzPzI2ZGIiXSwic291cmNlc0NvbnRlbnQiOlsiJ3VzZSBzdHJpY3QnO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgJ19fZXNNb2R1bGUnLCB7IHZhbHVlOiB0cnVlIH0pO1xuXG5mdW5jdGlvbiB4b3IoYSwgYikge1xuICBpZiAoYS5sZW5ndGggIT09IGIubGVuZ3RoKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdJbnB1dHMgc2hvdWxkIGhhdmUgdGhlIHNhbWUgbGVuZ3RoJyk7XG4gIH1cbiAgY29uc3QgcmVzdWx0ID0gbmV3IFVpbnQ4QXJyYXkoYS5sZW5ndGgpO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGEubGVuZ3RoOyBpKyspIHtcbiAgICByZXN1bHRbaV0gPSBhW2ldIF4gYltpXTtcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG5leHBvcnRzLnhvciA9IHhvcjtcbiJdLCJuYW1lcyI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(ssr)/./node_modules/uint8arrays/cjs/src/xor.js\n");

/***/ })

};
;