function tokenize(pathname) {
  return String(pathname || "/")
    .split("/")
    .filter(Boolean);
}

function createRouter() {
  const routes = [];

  function register(method, path, options, handler) {
    routes.push({
      method: method.toUpperCase(),
      path,
      segments: tokenize(path),
      options: {
        auth: true,
        bodyType: "none",
        ...options,
      },
      handler,
    });
  }

  function match(method, pathname) {
    const targetSegments = tokenize(pathname);
    const upperMethod = method.toUpperCase();

    for (const route of routes) {
      if (route.method !== upperMethod) {
        continue;
      }
      if (route.segments.length !== targetSegments.length) {
        continue;
      }

      const params = {};
      let matched = true;

      for (let index = 0; index < route.segments.length; index += 1) {
        const expected = route.segments[index];
        const actual = targetSegments[index];

        if (expected.startsWith(":")) {
          params[expected.slice(1)] = decodeURIComponent(actual);
          continue;
        }

        if (expected !== actual) {
          matched = false;
          break;
        }
      }

      if (matched) {
        return {
          route,
          params,
        };
      }
    }

    return null;
  }

  return {
    register,
    match,
  };
}

module.exports = {
  createRouter,
};
