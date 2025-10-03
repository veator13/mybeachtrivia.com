const { onDocumentDeleted } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
initializeApp();

/**
 * When employees/{uid} is deleted, remove the matching Auth user.
 * Safe if the user never existed (swallows user-not-found).
 */
exports.onEmployeeDeleted = onDocumentDeleted(
  { region: "us-central1", document: "employees/{uid}", retry: true },
  async (event) => {
    const uid = event.params.uid;
    try {
      await getAuth().deleteUser(uid);
      console.log("Deleted Auth user:", uid);
    } catch (e) {
      if (e.code === "auth/user-not-found") {
        console.log("No Auth user for:", uid);
      } else {
        throw e;
      }
    }
  }
);
