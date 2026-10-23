import AppKit

struct BallPosition: Codable { var edge: String; var fraction: Double }
enum Geometry {
    static let hit: CGFloat = 32
    static func clamp(_ value: CGFloat, _ lo: CGFloat, _ hi: CGFloat) -> CGFloat { min(max(value, lo), max(lo, hi)) }
    static func ball(_ position: BallPosition, in screen: CGRect) -> CGRect {
        let x = position.edge == "left" ? screen.minX + 8 : screen.maxX - 8 - hit
        let fraction = min(max(position.fraction, 0), 1)
        return CGRect(x: clamp(x,screen.minX,screen.maxX-hit), y: screen.minY + 8 + max(0,screen.height-16-hit)*fraction, width:hit,height:hit)
    }
    static func position(_ frame: CGRect, in screen: CGRect) -> BallPosition {
        BallPosition(edge:frame.midX < screen.midX ? "left":"right",fraction:Double(clamp((frame.minY-screen.minY-8)/max(1,screen.height-16-hit),0,1)))
    }
    static func panel(ball: CGRect, screen: CGRect) -> CGRect {
        let width: CGFloat = min(368, screen.width-24), height: CGFloat = min(600,screen.height-24)
        let x = ball.midX < screen.midX ? ball.maxX+8 : ball.minX-8-width
        return CGRect(x:clamp(x,screen.minX+12,screen.maxX-width-12),y:clamp(ball.maxY-height,screen.minY+12,screen.maxY-height-12),width:width,height:height)
    }
    static func check() {
        for screen in [CGRect(x:0,y:25,width:1440,height:850),CGRect(x:-1920,y:0,width:1920,height:1080),CGRect(x:0,y:0,width:800,height:420)] {
            for edge in ["left","right"] { for fraction in [-1.0,0,0.5,1,2] {
                let ball = ball(BallPosition(edge:edge,fraction:fraction),in:screen), panel = panel(ball:ball,screen:screen)
                precondition(screen.contains(ball));precondition(screen.contains(panel));precondition(panel.width==368);precondition(panel.height==min(600,screen.height-24))
            }}
        }
    }
}
