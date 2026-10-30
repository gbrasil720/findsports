import ExpoModulesCore
import UIKit

// A dobradiça do iPhone Duo (UIHinge, iOS 27.1). O status vira a postura que o
// JS lê; onde fica a dobra o JS sabe pela orientação da janela (no Duo ela
// corta a tela ao meio). Sem dobradiça, `unknown`.
public class FoldPostureModule: Module {
  private var posture: [String: Any] = ["state": "unknown"]
  private var interaction: AnyObject?

  public func definition() -> ModuleDefinition {
    Name("FoldPosture")
    Events("onChange")

    Function("getPosture") { self.posture }

    OnCreate {
      DispatchQueue.main.async { self.attach() }
    }

    OnDestroy {
      DispatchQueue.main.async { self.detach() }
    }
  }

  private func rootView() -> UIView? {
    let scene = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .first { $0.activationState == .foregroundActive } ??
      UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
    return scene?.windows.first { $0.isKeyWindow }?.rootViewController?.view ??
      scene?.windows.first?.rootViewController?.view
  }

  private func attach() {
    #if compiler(>=6.4)
    guard #available(iOS 27.1, *) else { return }
    guard let view = rootView() else {
      // A janela ainda não existe na primeira chamada: tenta de novo.
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { self.attach() }
      return
    }
    let hinge = UIHingeInteraction { [weak self] _, update in
      guard let self else { return }
      self.posture = Self.describe(update.hinge)
      self.sendEvent("onChange", self.posture)
    }
    view.addInteraction(hinge)
    interaction = hinge
    #endif
  }

  private func detach() {
    #if compiler(>=6.4)
    if #available(iOS 27.1, *), let hinge = interaction as? UIHingeInteraction {
      hinge.view?.removeInteraction(hinge)
    }
    #endif
    interaction = nil
  }

  #if compiler(>=6.4)
  @available(iOS 27.1, *)
  private static func describe(_ hinge: UIHinge?) -> [String: Any] {
    guard let hinge else { return ["state": "unknown"] }
    let state: String
    switch hinge.status {
    case .closed: state = "closed"
    case .partiallyOpen: state = "half"
    case .fullyOpen: state = "flat"
    default: state = "unknown"
    }
    return ["state": state, "angle": hinge.angle]
  }
  #endif
}
