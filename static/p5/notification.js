
function setup() {
  if (Notification.permission === "granted") {
    setTimeout(function() {
      let notification = new Notification("WFC Test", {
        body: "Hi",
        tag: "dedupe"
        // Also can contain badge, icon, image, data and more https://developer.mozilla.org/en-US/docs/Web/API/Notification/Notification
      });
      console.log("Notification", notification);
    }, 5000);
  } else {
    console.log("Notifications permission", Notification.permission);
  }
}
