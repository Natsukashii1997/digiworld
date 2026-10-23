import AppKit

// Cocoa pastes attachments from flat RTFD; plain RTF \pict is ignored by NSTextView.
enum RichClipboard {
    static func failure(_ message:String)->NSError {NSError(domain:"FloatingNotesClipboard",code:1,userInfo:[NSLocalizedDescriptionKey:message])}
    static func imageRTFD(_ value:[String:Any]) throws -> Data? {
        guard value["attachments"] != nil else{return nil}
        guard let items=value["attachments"] as? [[String:Any]],!items.isEmpty,items.count<=20,
              let source=value["rtfdSource"] as? String,source.utf8.count<=16_000_000,
              source.hasPrefix("{\\rtf1"),let bytes=source.data(using:.ascii) else{throw failure("图片复制内容无效")}
        let rich=try NSMutableAttributedString(data:bytes,options:[.documentType:NSAttributedString.DocumentType.rtf],documentAttributes:nil)
        var previous=rich.length,total=0
        for (index,item) in items.enumerated().reversed() {
            guard let location=item["location"] as? Int,location>=0,location<previous,
                  (rich.string as NSString).substring(with:NSRange(location:location,length:1))=="\u{fffc}",
                  let kind=item["kind"] as? String,["png","jpg"].contains(kind),
                  let encoded=item["data"] as? String,encoded.utf8.count<=11_200_000,
                  let data=Data(base64Encoded:encoded),!data.isEmpty,data.count<=8*1024*1024 else{throw failure("图片复制引用无效")}
            total+=data.count;guard total<=7_400_000 else{throw failure("图片总量较大，无法一次复制")}
            let signature=[UInt8](data.prefix(8))
            guard kind=="png" ? signature==[137,80,78,71,13,10,26,10] : Array(signature.prefix(3))==[255,216,255] else{throw failure("图片复制格式无效")}
            if kind=="png" {
                guard data.count>=24 else{throw failure("图片无法读取")}
                let header=[UInt8](data.prefix(24)),width=header[16..<20].reduce(UInt64(0)){($0<<8)|UInt64($1)},height=header[20..<24].reduce(UInt64(0)){($0<<8)|UInt64($1)}
                guard width>0,height>0,width<=40_000_000,height<=40_000_000,width*height<=40_000_000 else{throw failure("图片尺寸过大")}
            }
            guard let bitmap=NSBitmapImageRep(data:data),bitmap.pixelsWide>0,bitmap.pixelsHigh>0,
                  UInt64(bitmap.pixelsWide)*UInt64(bitmap.pixelsHigh)<=40_000_000 else{throw failure("图片无法读取")}
            let image=NSImage(size:NSSize(width:Double(min(bitmap.pixelsWide,600)),height:Double(bitmap.pixelsHigh)*Double(min(bitmap.pixelsWide,600))/Double(bitmap.pixelsWide)));image.addRepresentation(bitmap)
            let wrapper=FileWrapper(regularFileWithContents:data);wrapper.preferredFilename="image-\(index).\(kind)"
            let attachment=NSTextAttachment(fileWrapper:wrapper);attachment.attachmentCell=NSTextAttachmentCell(imageCell:image)
            rich.replaceCharacters(in:NSRange(location:location,length:1),with:NSAttributedString(attachment:attachment));previous=location
        }
        return try rich.data(from:NSRange(location:0,length:rich.length),documentAttributes:[.documentType:NSAttributedString.DocumentType.rtfd])
    }
}
