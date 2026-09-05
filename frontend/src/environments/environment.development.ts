// Local development configuration, used automatically by `ng serve`.
export const environment = {
  production: false,

  // Base URL of the locally running Spring Boot backend (see backend/src/main/resources/application.yml).
  apiBaseUrl: 'http://localhost:8080',

  // Resume upload, dashboard, and feedback have no backend controller yet (see docs/lld.md §7) —
  // this flag routes those calls to the in-memory mock backend (src/app/mock-api) instead of a
  // real HTTP request, so the UI can be built and tested against the documented DTOs today and
  // switched to the real API later by flipping this one value.
  useMockApiForUnimplementedFeatures: true,
};
