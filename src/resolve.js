/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 *
 * @format
 */
"use strict";

function ownKeys(object, enumerableOnly) {
  var keys = Object.keys(object);
  if (Object.getOwnPropertySymbols) {
    var symbols = Object.getOwnPropertySymbols(object);
    if (enumerableOnly)
      symbols = symbols.filter(function(sym) {
        return Object.getOwnPropertyDescriptor(object, sym).enumerable;
      });
    keys.push.apply(keys, symbols);
  }
  return keys;
}

function _objectSpread(target) {
  for (var i = 1; i < arguments.length; i++) {
    var source = arguments[i] != null ? arguments[i] : {};
    if (i % 2) {
      ownKeys(Object(source), true).forEach(function(key) {
        _defineProperty(target, key, source[key]);
      });
    } else if (Object.getOwnPropertyDescriptors) {
      Object.defineProperties(target, Object.getOwnPropertyDescriptors(source));
    } else {
      ownKeys(Object(source)).forEach(function(key) {
        Object.defineProperty(
          target,
          key,
          Object.getOwnPropertyDescriptor(source, key)
        );
      });
    }
  }
  return target;
}

function _defineProperty(obj, key, value) {
  if (key in obj) {
    Object.defineProperty(obj, key, {
      value: value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  } else {
    obj[key] = value;
  }
  return obj;
}

function _toConsumableArray(arr) {
  return (
    _arrayWithoutHoles(arr) ||
    _iterableToArray(arr) ||
    _unsupportedIterableToArray(arr) ||
    _nonIterableSpread()
  );
}

function _nonIterableSpread() {
  throw new TypeError(
    "Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."
  );
}

function _unsupportedIterableToArray(o, minLen) {
  if (!o) return;
  if (typeof o === "string") return _arrayLikeToArray(o, minLen);
  var n = Object.prototype.toString.call(o).slice(8, -1);
  if (n === "Object" && o.constructor) n = o.constructor.name;
  if (n === "Map" || n === "Set") return Array.from(o);
  if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n))
    return _arrayLikeToArray(o, minLen);
}

function _iterableToArray(iter) {
  if (typeof Symbol !== "undefined" && Symbol.iterator in Object(iter))
    return Array.from(iter);
}

function _arrayWithoutHoles(arr) {
  if (Array.isArray(arr)) return _arrayLikeToArray(arr);
}

function _arrayLikeToArray(arr, len) {
  if (len == null || len > arr.length) len = arr.length;
  for (var i = 0, arr2 = new Array(len); i < len; i++) arr2[i] = arr[i];
  return arr2;
}

const FailedToResolveNameError = require("./FailedToResolveNameError");

const FailedToResolvePathError = require("./FailedToResolvePathError");

const InvalidPackageError = require("./InvalidPackageError");

const formatFileCandidates = require("./formatFileCandidates");

const isAbsolutePath = require("absolute-path");

const path = require("path");

function resolve(context, moduleName, platform) {
  const resolveRequest = context.resolveRequest;

  if (
    !resolveRequest &&
    (isRelativeImport(moduleName) || isAbsolutePath(moduleName))
  ) {
    return resolveModulePath(context, moduleName, platform);
  }

  const realModuleName = context.redirectModulePath(moduleName); // exclude

  if (realModuleName === false) {
    return {
      type: "empty"
    };
  }

  const originModulePath = context.originModulePath;
  const isDirectImport =
    isRelativeImport(realModuleName) || isAbsolutePath(realModuleName); // We disable the direct file loading to let the custom resolvers deal with it

  if (!resolveRequest && isDirectImport) {
    // derive absolute path /.../node_modules/originModuleDir/realModuleName
    const fromModuleParentIdx =
      originModulePath.lastIndexOf("node_modules" + path.sep) + 13;
    const originModuleDir = originModulePath.slice(
      0,
      originModulePath.indexOf(path.sep, fromModuleParentIdx)
    );
    const absPath = path.join(originModuleDir, realModuleName);
    return resolveModulePath(context, absPath, platform);
  } // The Haste resolution must occur before the custom resolver because we want
  // to allow overriding imports. It could be part of the custom resolver, but
  // that's not the case right now.

  if (context.allowHaste && !isDirectImport) {
    const normalizedName = normalizePath(realModuleName);
    const result = resolveHasteName(context, normalizedName, platform);

    if (result.type === "resolved") {
      return result.resolution;
    }
  }

  if (resolveRequest) {
    try {
      const resolution = resolveRequest(
        context,
        realModuleName,
        platform,
        moduleName
      );

      if (resolution) {
        return resolution;
      }
    } catch (error) {}

    if (isDirectImport) {
      throw new Error("Failed to resolve module: " + realModuleName);
    }
  }

  const modulePaths = [];

  for (let modulePath of genModulePaths(context, realModuleName)) {
    modulePath = context.redirectModulePath(modulePath);
    const result = resolveFileOrDir(context, modulePath, platform);

    if (result.type === "resolved") {
      return result.resolution;
    }

    modulePaths.push(modulePath);
  }

  throw new FailedToResolveNameError(modulePaths);
}
/** Generate the potential module paths */

function* genModulePaths(context, toModuleName) {
  const extraNodeModules = context.extraNodeModules,
    follow = context.follow,
    originModulePath = context.originModulePath;
  /**
   * Extract the scope and package name from the module name.
   */

  let bits = path.normalize(toModuleName).split(path.sep);
  let packageName, scopeName;

  if (bits.length >= 2 && bits[0].startsWith("@")) {
    packageName = bits.slice(0, 2).join("/");
    scopeName = bits[0];
    bits = bits.slice(2);
  } else {
    packageName = bits.shift();
  }
  /**
   * Find the nearest "node_modules" directory that contains
   * the imported package.
   */

  const _path$parse = path.parse(originModulePath),
    root = _path$parse.root;

  let parent = originModulePath;

  do {
    parent = path.dirname(parent);

    if (path.basename(parent) !== "node_modules") {
      yield path.join.apply(
        path,
        [follow(path.join(parent, "node_modules", packageName))].concat(
          _toConsumableArray(bits)
        )
      );
    }
  } while (parent !== root);
  /**
   * Check the user-provided `extraNodeModules` module map for a
   * direct mapping to a directory that contains the imported package.
   */

  if (extraNodeModules) {
    parent =
      extraNodeModules[packageName] ||
      (scopeName ? extraNodeModules[scopeName] : void 0);

    if (parent) {
      yield path.join.apply(
        path,
        [follow(path.join(parent, packageName))].concat(
          _toConsumableArray(bits)
        )
      );
    }
  }
}
/**
 * Resolve any kind of module path, whether it's a file or a directory.
 * For example we may want to resolve './foobar'. The closest
 * `package.json` may define a redirection for this path, for example
 * `/smth/lib/foobar`, that may be further resolved to
 * `/smth/lib/foobar/index.ios.js`.
 */

function resolveModulePath(context, toModuleName, platform) {
  const modulePath = isAbsolutePath(toModuleName)
    ? resolveWindowsPath(toModuleName)
    : path.join(path.dirname(context.originModulePath), toModuleName);
  const redirectedPath = context.redirectModulePath(modulePath);

  if (redirectedPath === false) {
    return {
      type: "empty"
    };
  }

  const result = resolveFileOrDir(context, redirectedPath, platform);

  if (result.type === "resolved") {
    return result.resolution;
  }

  throw new FailedToResolvePathError(result.candidates);
}
/**
 * Resolve a module as a Haste module or package. For example we might try to
 * resolve `Foo`, that is provided by file `/smth/Foo.js`. Or, in the case of
 * a Haste package, it could be `/smth/Foo/index.js`.
 */

function resolveHasteName(context, moduleName, platform) {
  const modulePath = context.resolveHasteModule(moduleName);

  if (modulePath != null) {
    return resolvedAs({
      type: "sourceFile",
      filePath: modulePath
    });
  }

  let packageName = moduleName;
  let packageJsonPath = context.resolveHastePackage(packageName);

  while (packageJsonPath == null && packageName && packageName !== ".") {
    packageName = path.dirname(packageName);
    packageJsonPath = context.resolveHastePackage(packageName);
  }

  if (packageJsonPath == null) {
    return failedFor();
  }

  const packageDirPath = path.dirname(packageJsonPath);
  const pathInModule = moduleName.substring(packageName.length + 1);
  const potentialModulePath = path.join(packageDirPath, pathInModule);
  const result = resolveFileOrDir(context, potentialModulePath, platform);

  if (result.type === "resolved") {
    return result;
  }

  const candidates = result.candidates;
  const opts = {
    moduleName,
    packageName,
    pathInModule,
    candidates
  };
  throw new MissingFileInHastePackageError(opts);
}

class MissingFileInHastePackageError extends Error {
  constructor(opts) {
    super(
      `While resolving module \`${opts.moduleName}\`, ` +
        `the Haste package \`${opts.packageName}\` was found. However the ` +
        `module \`${opts.pathInModule}\` could not be found within ` +
        "the package. Indeed, none of these files exist:\n\n" +
        `  * \`${formatFileCandidates(opts.candidates.file)}\`\n` +
        `  * \`${formatFileCandidates(opts.candidates.dir)}\``
    );
    Object.assign(this, opts);
  }
}
/**
 * In the NodeJS-style module resolution scheme we want to check potential
 * paths both as directories and as files. For example, `/foo/bar` may resolve
 * to `/foo/bar.js` (preferred), but it might also be `/foo/bar/index.js`, or
 * even a package directory.
 */

function resolveFileOrDir(context, potentialModulePath, platform) {
  const dirPath = path.dirname(potentialModulePath);
  const fileNameHint = path.basename(potentialModulePath);
  const fileResult = resolveFile(context, dirPath, fileNameHint, platform);

  if (fileResult.type === "resolved") {
    return fileResult;
  }

  const dirResult = resolveDir(context, potentialModulePath, platform);

  if (dirResult.type === "resolved") {
    return dirResult;
  }

  return failedFor({
    file: fileResult.candidates,
    dir: dirResult.candidates
  });
}
/**
 * Try to resolve a potential path as if it was a directory-based module.
 * Either this is a directory that contains a package, or that the directory
 * contains an index file. If it fails to resolve these options, it returns
 * `null` and fills the array of `candidates` that were tried.
 *
 * For example we could try to resolve `/foo/bar`, that would eventually
 * resolve to `/foo/bar/lib/index.ios.js` if we're on platform iOS and that
 * `bar` contains a package which entry point is `./lib/index` (or `./lib`).
 */

function resolveDir(context, potentialDirPath, platform) {
  const packageJsonPath = path.join(potentialDirPath, "package.json");

  if (context.doesFileExist(packageJsonPath)) {
    const resolution = resolvePackage(context, packageJsonPath, platform);
    return {
      resolution,
      type: "resolved"
    };
  }

  return resolveFile(context, potentialDirPath, "index", platform);
}
/**
 * Resolve the main module of a package that we know exist. The resolution
 * itself cannot fail because we already resolved the path to the package.
 * If the `main` of the package is invalid, this is not a resolution failure,
 * this means the package is invalid, and should purposefully stop the
 * resolution process altogether.
 */

function resolvePackage(context, packageJsonPath, platform) {
  const mainPrefixPath = context.getPackageMainPath(packageJsonPath);
  const dirPath = path.dirname(mainPrefixPath);
  const prefixName = path.basename(mainPrefixPath);
  const fileResult = resolveFile(context, dirPath, prefixName, platform);

  if (fileResult.type === "resolved") {
    return fileResult.resolution;
  }

  const indexResult = resolveFile(context, mainPrefixPath, "index", platform);

  if (indexResult.type === "resolved") {
    return indexResult.resolution;
  }

  throw new InvalidPackageError({
    packageJsonPath,
    mainPrefixPath,
    indexCandidates: indexResult.candidates,
    fileCandidates: fileResult.candidates
  });
}
/**
 * Given a file name for a particular directory, return a resolution result
 * depending on whether or not we found the corresponding module as a file. For
 * example, we might ask for `foo.png`, that resolves to
 * `['/js/beep/foo.ios.png']`. Or we may ask for `boop`, that resolves to
 * `/js/boop.android.ts`. On the other hand this function does not resolve
 * directory-based module names: for example `boop` will not resolve to
 * `/js/boop/index.js` (see `_loadAsDir` for that).
 */

function resolveFile(context, dirPath, fileName, platform) {
  const isAssetFile = context.isAssetFile,
    resolveAsset = context.resolveAsset;

  if (isAssetFile(fileName)) {
    const extension = path.extname(fileName);
    const basename = path.basename(fileName, extension);

    if (!/@\d+(?:\.\d+)?x$/.test(basename)) {
      try {
        const assets = resolveAsset(dirPath, basename, extension);

        if (assets != null) {
          return mapResult(resolvedAs(assets), filePaths => ({
            type: "assetFiles",
            filePaths
          }));
        }
      } catch (err) {
        if (err.code === "ENOENT") {
          return failedFor({
            type: "asset",
            name: fileName
          });
        }
      }
    }

    return failedFor({
      type: "asset",
      name: fileName
    });
  }

  const candidateExts = [];
  const filePathPrefix = path.join(dirPath, fileName);

  const sfContext = _objectSpread(
    _objectSpread({}, context),
    {},
    {
      candidateExts,
      filePathPrefix
    }
  );

  const filePath = resolveSourceFile(sfContext, platform);

  if (filePath != null) {
    return resolvedAs({
      type: "sourceFile",
      filePath
    });
  }

  return failedFor({
    type: "sourceFile",
    filePathPrefix,
    candidateExts
  });
}

/**
 * A particular 'base path' can resolve to a number of possibilities depending
 * on the context. For example `foo/bar` could resolve to `foo/bar.ios.js`, or
 * to `foo/bar.js`. If can also resolve to the bare path `foo/bar` itself, as
 * supported by Node.js resolution. On the other hand it doesn't support
 * `foo/bar.ios`, for historical reasons.
 *
 * Return the full path of the resolved module, `null` if no resolution could
 * be found.
 */
function resolveSourceFile(context, platform) {
  let filePath = resolveSourceFileForAllExts(context, "");

  if (filePath) {
    return filePath;
  }

  const sourceExts = context.sourceExts;

  for (let i = 0; i < sourceExts.length; i++) {
    const ext = `.${sourceExts[i]}`;
    filePath = resolveSourceFileForAllExts(context, ext, platform);

    if (filePath != null) {
      return filePath;
    }
  }

  return null;
}

/**
 * For a particular extension, ex. `js`, we want to try a few possibilities,
 * such as `foo.ios.js`, `foo.native.js`, and of course `foo.js`. Return the
 * full path of the resolved module, `null` if no resolution could be found.
 */
function resolveSourceFileForAllExts(context, sourceExt, platform) {
  if (platform != null) {
    const ext = `.${platform}${sourceExt}`;
    const filePath = resolveSourceFileForExt(context, ext);

    if (filePath) {
      return filePath;
    }
  }

  if (context.preferNativePlatform) {
    const filePath = resolveSourceFileForExt(context, `.native${sourceExt}`);

    if (filePath) {
      return filePath;
    }
  }

  const filePath = resolveSourceFileForExt(context, sourceExt);
  return filePath;
}

/**
 * We try to resolve a single possible extension. If it doesn't exist, then
 * we make sure to add the extension to a list of candidates for reporting.
 */
function resolveSourceFileForExt(context, extension) {
  const filePath = `${context.filePathPrefix}${extension}`;

  if (context.doesFileExist(filePath)) {
    return filePath;
  }

  context.candidateExts.push(extension);
  return null;
} // HasteFS stores paths with backslashes on Windows, this ensures the path is in
// the proper format. Will also add drive letter if not present so `/root` will
// resolve to `C:\root`. Noop on other platforms.

function resolveWindowsPath(modulePath) {
  if (path.sep !== "\\") {
    return modulePath;
  }

  return path.resolve(modulePath);
}

function isRelativeImport(filePath) {
  return /^[.][.]?(?:[/]|$)/.test(filePath);
}

function normalizePath(modulePath) {
  if (path.sep === "/") {
    modulePath = path.normalize(modulePath);
  } else if (path.posix) {
    modulePath = path.posix.normalize(modulePath);
  }

  return modulePath.replace(/\/$/, "");
}

function resolvedAs(resolution) {
  return {
    type: "resolved",
    resolution
  };
}

function failedFor(candidates) {
  return {
    type: "failed",
    candidates
  };
}

function mapResult(result, mapper) {
  if (result.type === "failed") {
    return result;
  }

  return {
    type: "resolved",
    resolution: mapper(result.resolution)
  };
}

module.exports = resolve;
