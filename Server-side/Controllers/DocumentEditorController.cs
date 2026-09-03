using Microsoft.AspNetCore.Mvc;
using Syncfusion.EJ2.DocumentEditor;
using WFormatType = Syncfusion.DocIO.FormatType;
using Syncfusion.EJ2.SpellChecker;
using Microsoft.AspNetCore.Cors;

namespace CollaborativeEditingServerSide.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class DocumentEditorController : ControllerBase
    {
        // Handles importing a document file and converting it to JSON format
        [AcceptVerbs("Post")]
        [HttpPost]
        [EnableCors("AllowAllOrigins")]
        [Route("Import")]
        public string? Import(IFormCollection data)
        {
            if (data.Files.Count == 0)
                return null;
            Stream stream1 = new MemoryStream();
            IFormFile file = data.Files[0];
            int index = file.FileName.LastIndexOf('.');
            string type = index > -1 && index < file.FileName.Length - 1 ?
                file.FileName.Substring(index) : ".docx";
            file.CopyTo(stream1);
            stream1.Position = 0;

            WordDocument document = WordDocument.Load(stream1, GetFormatType(type.ToLower()));
            string json = Newtonsoft.Json.JsonConvert.SerializeObject(document);
            document.Dispose();
            return json;
        }

        public class CustomParams
        {
            public string? fileName
            {
                get;
                set;
            }
        }

        // Performs spell checking on the provided text
        [AcceptVerbs("Post")]
        [HttpPost]
        [EnableCors("AllowAllOrigins")]
        [Route("SpellCheck")]
        public string SpellCheck([FromBody] SpellCheckJsonData spellChecker)
        {
            try
            {
                SpellChecker spellCheck = new SpellChecker();
                spellCheck.GetSuggestions(spellChecker.LanguageID, spellChecker.TexttoCheck, spellChecker.CheckSpelling, spellChecker.CheckSuggestion, spellChecker.AddWord);
                return Newtonsoft.Json.JsonConvert.SerializeObject(spellCheck);
            }
            catch
            {
                return "{\"SpellCollection\":[],\"HasSpellingError\":false,\"Suggestions\":null}";
            }
        }

        // Performs spell checking for an entire page
        [AcceptVerbs("Post")]
        [HttpPost]
        [EnableCors("AllowAllOrigins")]
        [Route("SpellCheckByPage")]
        public string SpellCheckByPage([FromBody] SpellCheckJsonData spellChecker)
        {
            try
            {
                SpellChecker spellCheck = new SpellChecker();
                spellCheck.CheckSpelling(spellChecker.LanguageID, spellChecker.TexttoCheck);
                return Newtonsoft.Json.JsonConvert.SerializeObject(spellCheck);
            }
            catch
            {
                return "{\"SpellCollection\":[],\"HasSpellingError\":false,\"Suggestions\":null}";
            }
        }

        // Representing spell check request parameters
        public class SpellCheckJsonData
        {
            public int LanguageID { get; set; }
            public string? TexttoCheck { get; set; }
            public bool CheckSpelling { get; set; }
            public bool CheckSuggestion { get; set; }
            public bool AddWord { get; set; }

        }

        // Representing parameters for clipboard operations
        public class CustomParameter
        {
            public string? content { get; set; }
            public string? type { get; set; }
        }

        // Handles clipboard operations, converting document content into JSON 
        [AcceptVerbs("Post")]
        [HttpPost]
        [EnableCors("AllowAllOrigins")]
        [Route("SystemClipboard")]
        public string SystemClipboard([FromBody] CustomParameter param)
        {
            if (param.content != null && param.content != "")
            {
                try
                {
                    WordDocument document = WordDocument.LoadString(param.content, GetFormatType(param.type!.ToLower()));
                    string json = Newtonsoft.Json.JsonConvert.SerializeObject(document);
                    document.Dispose();
                    return json;
                }
                catch (Exception)
                {
                    return "";
                }
            }
            return "";
        }

        // Representing parameters for clipboard operations
        public class CustomRestrictParameter
        {
            public string? passwordBase64 { get; set; }
            public string? saltBase64 { get; set; }
            public int spinCount { get; set; }
        }

        // Handles document editing restrictions
        [AcceptVerbs("Post")]
        [HttpPost]
        [EnableCors("AllowAllOrigins")]
        [Route("RestrictEditing")]
        public string[]? RestrictEditing([FromBody] CustomRestrictParameter param)
        {
            if (param.passwordBase64 == "" && param.passwordBase64 == null)
                return null;
            return WordDocument.ComputeHash(param.passwordBase64, param.saltBase64, param.spinCount);
        }

        // Determines the document format based on file extension
        internal static FormatType GetFormatType(string format)
        {
            if (string.IsNullOrEmpty(format))
                throw new NotSupportedException("EJ2 DocumentEditor does not support this file format.");
            switch (format.ToLower())
            {
                case ".dotx":
                case ".docx":
                case ".docm":
                case ".dotm":
                    return FormatType.Docx;
                case ".dot":
                case ".doc":
                    return FormatType.Doc;
                case ".rtf":
                    return FormatType.Rtf;
                case ".txt":
                    return FormatType.Txt;
                case ".xml":
                    return FormatType.WordML;
                case ".html":
                    return FormatType.Html;
                default:
                    throw new NotSupportedException("EJ2 DocumentEditor does not support this file format.");
            }
        }

        // Determines the document format type specifically for Word formats
        internal static WFormatType GetWFormatType(string format)
        {
            if (string.IsNullOrEmpty(format))
                throw new NotSupportedException("EJ2 DocumentEditor does not support this file format.");
            switch (format.ToLower())
            {
                case ".dotx":
                    return WFormatType.Dotx;
                case ".docx":
                    return WFormatType.Docx;
                case ".docm":
                    return WFormatType.Docm;
                case ".dotm":
                    return WFormatType.Dotm;
                case ".dot":
                    return WFormatType.Dot;
                case ".doc":
                    return WFormatType.Doc;
                case ".rtf":
                    return WFormatType.Rtf;
                case ".html":
                    return WFormatType.Html;
                case ".txt":
                    return WFormatType.Txt;
                case ".xml":
                    return WFormatType.WordML;
                case ".odt":
                    return WFormatType.Odt;
                default:
                    throw new NotSupportedException("EJ2 DocumentEditor does not support this file format.");
            }
        }

    }
}
