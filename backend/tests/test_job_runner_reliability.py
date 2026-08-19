import unittest

from services.reliability import classify_failure, retry_delay_seconds


class FailureClassificationTests(unittest.TestCase):
    def test_credential_errors_are_not_retried(self):
        self.assertEqual(
            classify_failure("Login failed: invalid password"), "permanent"
        )

    def test_unknown_worker_exit_is_transient(self):
        self.assertEqual(
            classify_failure("Worker exited with code 1"), "transient"
        )

    def test_retry_delay_is_exponential(self):
        self.assertEqual(retry_delay_seconds(1, 30), 30)
        self.assertEqual(retry_delay_seconds(2, 30), 60)
        self.assertEqual(retry_delay_seconds(3, 30), 120)


if __name__ == "__main__":
    unittest.main()
