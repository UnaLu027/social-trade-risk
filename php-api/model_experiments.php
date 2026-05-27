<?php
/**
 * GET /model_experiments.php         → all experiment records ordered by weighted_f1 desc
 * GET /model_experiments.php?id=N    → single record
 */
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/db.php';
require_once __DIR__ . '/config/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonError('Method not allowed', 405);

try {
    $pdo = getDbPdo();
    $id  = isset($_GET['id']) ? (int) $_GET['id'] : null;

    if ($id) {
        $stmt = $pdo->prepare(
            "SELECT id, experiment_id, model_name, feature_set,
                    accuracy, macro_f1, weighted_f1, high_risk_recall,
                    confusion_matrix_json, feature_importance_json,
                    model_path, trained_at, created_at
             FROM model_experiments WHERE id = ?"
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) jsonError('Experiment not found', 404);

        // Decode JSON fields
        $row['confusion_matrix']   = json_decode($row['confusion_matrix_json']   ?? '[]', true);
        $row['feature_importance'] = json_decode($row['feature_importance_json']  ?? '{}', true);
        jsonSuccess($row);

    } else {
        $stmt = $pdo->query(
            "SELECT id, experiment_id, model_name, feature_set,
                    accuracy, macro_f1, weighted_f1, high_risk_recall,
                    confusion_matrix_json, feature_importance_json,
                    model_path, trained_at, created_at
             FROM model_experiments
             ORDER BY weighted_f1 DESC"
        );
        $rows = $stmt->fetchAll();
        foreach ($rows as &$r) {
            $r['confusion_matrix']   = json_decode($r['confusion_matrix_json']   ?? '[]', true);
            $r['feature_importance'] = json_decode($r['feature_importance_json']  ?? '{}', true);
        }
        jsonSuccess(['count' => count($rows), 'experiments' => $rows]);
    }

} catch (Throwable $e) {
    jsonError('Database error: ' . $e->getMessage());
}
