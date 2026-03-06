/*:
 * @plugindesc ReportData plugin command for telemetry. Offline queue + retry.
 * @author ThreeDungeons
 *
 * @help Requires Section 6 Edge Function report-telemetry. Configure baasUrl in plugin parameters (same as ResidencyAuth).
 * Plugin Command: ReportData <moduleId> <action> <outcome> [score]
 * Example: ReportData CE_Q1_FlashPulmEdema AdministerBiPAP correct 100
 *
 * @param baasUrl
 * @desc Supabase project URL (e.g. https://xxxxx.supabase.co). Same as ResidencyAuth.
 * @default
 *
 * @param telemetryPath
 * @desc Edge Function path for telemetry.
 * @default /functions/v1/report-telemetry
 *
 */

(function() {
    'use strict';

    var params = PluginManager.parameters('ResidencyTelemetry');
    var authParams = PluginManager.parameters('ResidencyAuth') || {};
    var BAAS_URL = String(params['baasUrl'] || authParams['baasUrl'] || '').trim();
    var TELEMETRY_PATH = String(params['telemetryPath'] || '/functions/v1/report-telemetry');
    var QUEUE_KEY = 'residency_telemetry_queue';
    var MAX_QUEUE = 500;

    function getQueue() {
        try {
            var raw = localStorage.getItem(QUEUE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    function saveQueue(queue) {
        try {
            localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
        } catch (e) {}
    }

    function addToQueue(payload) {
        var queue = getQueue();
        if (queue.length >= MAX_QUEUE) return;
        queue.push(payload);
        saveQueue(queue);
    }

    function clearQueue() {
        saveQueue([]);
    }

    function removeFirstFromQueue() {
        var queue = getQueue();
        if (queue.length === 0) return;
        queue.shift();
        saveQueue(queue);
    }

    function sendPayload(payload, onSuccess, on401, onFailure) {
        var token = sessionStorage.getItem('residency_token');
        if (!token || !BAAS_URL) {
            if (onFailure) onFailure();
            return;
        }

        var body = {
            module_id: payload.module_id,
            action: payload.action,
            outcome: payload.outcome
        };
        if (payload.score != null && !isNaN(payload.score)) {
            body.score = payload.score;
        }

        fetch(BAAS_URL + TELEMETRY_PATH, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        }).then(function(res) {
            if (res.status === 401) {
                if (on401) on401();
                return;
            }
            if (res.ok) {
                if (onSuccess) onSuccess();
                return;
            }
            if (res.status >= 500 && onFailure) onFailure();
        }).catch(function() {
            if (onFailure) onFailure();
        });
    }

    function flushQueue() {
        var token = sessionStorage.getItem('residency_token');
        if (!token || !BAAS_URL) return;

        var queue = getQueue();
        if (queue.length === 0) return;

        var payload = queue[0];
        sendPayload(payload,
            function() {
                removeFirstFromQueue();
                flushQueue();
            },
            function() {
                clearQueue();
            },
            function() {}
        );
    }

    function sendOrQueue(payload) {
        if (!sessionStorage.getItem('residency_token') || !BAAS_URL) return;

        sendPayload(payload,
            function() {},
            function() {},
            function() {
                addToQueue(payload);
            }
        );
    }

    function handleReportData(args) {
        if (!sessionStorage.getItem('residency_token')) return;
        if (!BAAS_URL) return;

        var moduleId = args[0] ? String(args[0]).trim() : '';
        var action = args[1] ? String(args[1]).trim() : '';
        var outcome = args[2] ? String(args[2]).trim() : '';
        var score = args[3] !== undefined && args[3] !== '' ? parseFloat(args[3]) : null;
        if (isNaN(score)) score = null;

        if (!moduleId || !action || !outcome) return;

        flushQueue();

        var payload = {
            module_id: moduleId,
            action: action,
            outcome: outcome,
            score: score
        };
        sendOrQueue(payload);
    }

    var _pluginCommand = Game_Interpreter.prototype.pluginCommand;
    Game_Interpreter.prototype.pluginCommand = function(cmd, args) {
        if (cmd === 'ReportData') {
            handleReportData(args);
        } else {
            _pluginCommand.call(this, cmd, args);
        }
    };

    window.addEventListener('online', flushQueue);
})();
