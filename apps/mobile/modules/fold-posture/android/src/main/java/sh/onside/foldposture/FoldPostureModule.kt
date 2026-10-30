package sh.onside.foldposture

import android.app.Activity
import androidx.core.util.Consumer
import androidx.window.java.layout.WindowInfoTrackerCallbackAdapter
import androidx.window.layout.FoldingFeature
import androidx.window.layout.WindowInfoTracker
import androidx.window.layout.WindowLayoutInfo
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// A dobra dos dobráveis Android (Jetpack WindowManager): estado (plano ou meio
// dobrado), orientação e onde ela fica na janela, em dp. Sem dobra, `unknown`.
class FoldPostureModule : Module() {
  private var posture: Map<String, Any?> = mapOf("state" to "unknown")
  private var tracker: WindowInfoTrackerCallbackAdapter? = null
  private var watched: Activity? = null

  private val listener = Consumer<WindowLayoutInfo> { info ->
    posture = describe(info)
    sendEvent("onChange", posture)
  }

  override fun definition() = ModuleDefinition {
    Name("FoldPosture")
    Events("onChange")

    Function("getPosture") { posture }

    OnActivityEntersForeground { watch() }
    OnCreate { watch() }
    OnActivityDestroys { unwatch() }
    OnDestroy { unwatch() }
  }

  private fun watch() {
    val activity = appContext.currentActivity ?: return
    if (watched === activity) return
    unwatch()
    val adapter = WindowInfoTrackerCallbackAdapter(WindowInfoTracker.getOrCreate(activity))
    adapter.addWindowLayoutInfoListener(activity, activity.mainExecutor, listener)
    tracker = adapter
    watched = activity
  }

  private fun unwatch() {
    tracker?.removeWindowLayoutInfoListener(listener)
    tracker = null
    watched = null
  }

  private fun describe(info: WindowLayoutInfo): Map<String, Any?> {
    val fold = info.displayFeatures.filterIsInstance<FoldingFeature>().firstOrNull()
      ?: return mapOf("state" to "unknown")
    val density = watched?.resources?.displayMetrics?.density ?: 1f
    val b = fold.bounds
    return mapOf(
      "state" to if (fold.state == FoldingFeature.State.HALF_OPENED) "half" else "flat",
      "orientation" to if (fold.orientation == FoldingFeature.Orientation.VERTICAL) "vertical" else "horizontal",
      "separating" to fold.isSeparating,
      "hinge" to mapOf(
        "x" to b.left / density,
        "y" to b.top / density,
        "width" to b.width() / density,
        "height" to b.height() / density
      )
    )
  }
}
