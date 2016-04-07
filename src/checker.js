import angular from 'angular';
import 'theseus-angular';
import {Rx} from 'rx';

export var checker = angular.module('amiuptodate', ['theseus']);

checker.config(['$provide', function ($provide) {
  $provide.factory('checker', [
          '$window',
          'amiuptodate.appNamespace',
          'amiuptodate.buildInfoUrl',
          'amiuptodate.pollInterval',
          'theseus.client',

          function($window, appNamespace, buildInfoUrl, pollInterval, client) {

    const retryAttempts = 5;
    const pollMillis = pollInterval * 1000;
    const poller$    = Rx.Observable.interval(pollMillis).timeInterval()

    function Rev() {
        const localStorage = $window.localStorage;
        const storeKey = `${appNamespace}.revision`;

        return {
            get: () => localStorage.getItem(storeKey),
            set: (rev) => localStorage.setItem(storeKey, rev)
        }
    }

    const rev = Rev();

    function getResponse$() {
        const params = { headers: { 'Accept' : 'application/json' }};
        const clientPromise = client.resource(buildInfoUrl).get({},params);

        return Rx.Observable.fromPromise(clientPromise);
    };

    const buildInfo$ = poller$
        .flatMap((n) => getResponse$().map((response) => response.data))
        .retryWhen((attempts) => Rx.Observable
            .range(1, retryAttempts)
            .zip(attempts, (i) =>  i)
            .flatMap((i) => Rx.Observable.timer(i * i * 1000)));

    const updated$ = buildInfo$
        .map((data) => checkUpdated(data.Revision))
        .distinctUntilChanged();

    function checkUpdated(version) {
        const storeVersion = rev.get();
        const isFirstLoad = (storeVersion === null);
        const isUpdated = isFirstLoad ? false : (storeVersion != version);

        if (isFirstLoad) { rev.set(storeKey, version); }

        return isUpdated;
    };

    const setRevisionFromApi$ = getResponse$()
      .map((response) => rev.set(response.data.Revision))

    const refresh$ = updated$
      .filter((updated) => updated)
      .flatMap((_) => setRevisionFromApi$)
      .map((_) => $window.location.reload());  

    return { buildInfo$, updated$, setRevisionFromApi$, refresh$ };
  }]);
}]);
